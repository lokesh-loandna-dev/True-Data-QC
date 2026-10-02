#!/usr/bin/env python3
"""
Business-condition validation, driven by Condition_Validation_v2.xlsx.

This module is deliberately self-contained and additive: it appends its own
columns and never modifies the dictionary / data-type / enum / macro results
produced by validate_loan_files.py.

The spec sheet expresses rules as English sentences. They are parsed into typed
rule objects at load time. Anything that cannot be parsed with confidence is
reported as "Not Automated" together with the original sentence -- it is never
silently treated as passing.

Rule families recognised
------------------------
    NOT_BLANK          "This should never be 'blank'"
    ALWAYS_EQUALS      "This should be always 'No'"
    ALLOWED_SET        "should be either 'A' or 'B'" /
                       "Must be updated as 'Yes' or 'NA' and never be 'Missing'"
    VALID_DATE         "Must be a valid date (Year cannot start with '00'/'02')"
    MUTEX              "If '<opt>' ... is selected, then 'A' or 'B' ...
                        should never be selected"
    COND_NOT_BLANK     "If '<ref>' states '<v>', then this should never be blank"
    COND_EQUALS        "If '<ref>' states '<v>', then it should be '<x>'"
    COND_NOT_EQUALS    "If '<ref>' states '<v>', then it should never be '<x>'"
    COND_STARTS_WITH   "If the '<ref>' field starts with 'A' or 'V' then ..."
"""

from __future__ import annotations

# Bump this whenever rule parsing or evaluation changes in a way that alters
# results. validate_loan_files_v5.py and audit_conditions.py check it at
# startup so a stale copy of this file cannot be used silently -- that once
# produced two different audits from the same spec with no warning.
__version__ = "5.7.0"

import logging
import re
from functools import lru_cache
from dataclasses import dataclass, field as dc_field

import openpyxl

log = logging.getLogger("validate.conditions")

# Spec sheet columns
SPEC_SHEET = "Sheet1"
SPEC_FIELD_COL = "Data Field"
SPEC_SOURCE_COL = "True Source"
SPEC_KIND_COL = "Direct Field/Inter Related"
SPEC_COND_COL = "Conditions"

CONDITION_COLUMNS = [
    "Condition Validation",
    "Condition Rule Type",
    "Condition Remarks",
]

# Values that count as an affirmative / ticked checkbox in the sample exports.
TRUE_TOKENS = {"true", "yes", "y", "1", "x", "checked", "selected", "present"}
FALSE_TOKENS = {"false", "no", "n", "0", "unchecked", "not selected"}

# Phrases meaning "empty" when they appear inside quotes in the spec.
BLANK_WORDS = {"blank", "empty", "null", ""}

_QUOTED = re.compile(r'"\s*([^"]*?)\s*"')

# Families that establish a condition later clauses in the same cell inherit.
CONDITIONAL_FAMILIES = {
    "COND_NOT_BLANK", "COND_MUST_BE_BLANK", "COND_EQUALS", "COND_NOT_EQUALS",
    "COND_ALLOWED_SET",
}

# Bare constraint families that may inherit a preceding condition.
GUARDABLE_FAMILIES = {
    "NOT_BLANK", "NOT_EQUALS", "ALLOWED_SET", "GREATER_THAN", "EXACT_DIGITS",
    "NOT_FUTURE_DATE", "MIN_YEAR", "VALID_DATE", "MIN_VALUE", "MAX_VALUE",
    "FORMAT", "DATE_COMPARE",
}


_NORM_STRIP = re.compile(r"[^a-z0-9]")


@lru_cache(maxsize=100_000)
def _norm_cached(text: str) -> str:
    return _NORM_STRIP.sub("", text.lower())


def _norm(text) -> str:
    """Lowercase, strip every non-alphanumeric character.

    Called several hundred thousand times per file over a small set of field
    names and values, so the result is memoised; this was the single largest
    cost in validation.
    """
    try:
        return _norm_cached(text if isinstance(text, str) else str(text))
    except TypeError:                     # unhashable
        return _NORM_STRIP.sub("", str(text).lower())


def _clean(text) -> str:
    return " ".join(str(text or "").split())


def _parse_magnitude(text) -> float | None:
    """Parse a spec number, honouring k/m/bn suffixes.

    "30k" means 30,000. Reading it as 30 understates the threshold by a
    factor of 1000 and lets real breaches pass.
    """
    if text is None:
        return None
    # The suffix must end the token: "3 m" sliced out of "3 months" was being
    # read as 3,000,000.
    match = re.match(r"^\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*"
                     r"(k|m|mm|bn|b)?\s*$", str(text).strip(), re.I)
    if not match:
        return None
    number = float(match.group(1).replace(",", ""))
    suffix = (match.group(2) or "").lower()
    return number * {"k": 1_000, "m": 1_000_000, "mm": 1_000_000,
                     "b": 1_000_000_000, "bn": 1_000_000_000}.get(suffix, 1)


def _numeric_value(value) -> float | None:
    """Coerce a sample value to a number, ignoring currency decoration."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(re.sub(r"[,$%\s]", "", str(value)))
    except (TypeError, ValueError):
        return None


def split_multivalue_numbers(text: str) -> list[str]:
    """Split a cell holding several numbers into its parts.

    Handles JSON arrays ('[112, 118]') and comma, semicolon, pipe or
    whitespace separated lists.
    """
    working = str(text).strip()
    if working.startswith("[") and working.endswith("]"):
        working = working[1:-1]
    parts = [p.strip().strip('"').strip("'")
             for p in re.split(r"[,;|]", working)]
    if len(parts) == 1:
        parts = [p for p in re.split(r"\s+", parts[0]) if p]
    return [p for p in parts if p != ""]


def _display_text(value) -> str:
    """Render a cell value as the text a human would see.

    A long identifier stored as a number (an 18-digit MIN, say) becomes
    '1.0002350026003446e+17' under str(), which breaks any digit or format
    check. Integer-valued floats are rendered in full instead.
    """
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, float) and value == int(value) and abs(value) < 1e18:
        return str(int(value))
    return str(value).strip()


def _is_blank_value(value) -> bool:
    if value is None:
        return True
    text = str(value).strip()
    return text == "" or text.lower() in {"nan", "none"}


def _is_true(value) -> bool:
    return str(value).strip().lower() in TRUE_TOKENS


def _quoted(text: str) -> list[str]:
    return [m.strip() for m in _QUOTED.findall(text)]


def _value_tokens(text: str) -> list[str]:
    """Quoted tokens that are genuinely VALUES.

    Drops screen references and anything followed by the word "field(s)":
    'the "Note Date" fields in "Note" Screen' names a field to compare
    against, not a literal value the cell should equal. Reading it as a value
    produced confident but wrong verdicts.
    """
    out = []
    for match in _QUOTED.finditer(text):
        token = match.group(1).strip()
        following = text[match.end():match.end() + 14].lower()
        if re.match(r"\s*(screen|screens|tab|page|field|fields|filed)\b",
                    following):
            continue
        if "screen" in token.lower():
            continue
        out.append(token)
    return out


def _quoted_values(text: str) -> list[str]:
    """Quoted tokens with screen references removed.

    The spec writes '"Judgments Number Of" filed in "Credit Liabilities"
    screen states other than "0"'. The screen name sits in quotes with the
    word 'screen' OUTSIDE them, so a naive filter kept it and treated
    'Credit Liabilities' as one of the permitted values.
    """
    out = []
    for match in _QUOTED.finditer(text):
        token = match.group(1).strip()
        following = text[match.end():match.end() + 12].lower()
        if re.match(r"\s*(screen|screens|tab|page)\b", following):
            continue
        if "screen" in token.lower():
            continue
        out.append(token)
    return out


# --------------------------------------------------------------------------- #
# Rule model
# --------------------------------------------------------------------------- #

@dataclass
class Rule:
    field: str
    source: str
    kind: str                 # "Direct" / "Related" as stated in the spec
    text: str                 # original sentence
    family: str = "NOT_AUTOMATED"
    params: dict = dc_field(default_factory=dict)


# --------------------------------------------------------------------------- #
# Parsing
# --------------------------------------------------------------------------- #

def _split_clauses(condition: str) -> list[str]:
    """Split a spec cell into individually numbered sentences."""
    raw = str(condition or "")
    parts = re.split(r"(?m)^\s*\d+\s*[.)]\s*", raw)
    if len(parts) == 1:
        parts = re.split(r"(?:(?<=\.)|(?<=\n))\s*(?=\d+\s*[.)]\s)", raw)
    return [_clean(p) for p in parts if _clean(p)]


def _extract_format_constraints(text: str) -> dict:
    """Pull character-format constraints out of a sentence fragment.

    Shared by unconditional FORMAT clauses and conditional consequents such as
    'then this needs to be updated ( 18 Numerics)'.
    """
    body = re.sub(r"\([^)]*\)", " ", text.lower())
    inside = " ".join(re.findall(r"\(([^)]*)\)", text.lower()))
    fmt = {}

    if "alphanumeric" in body:
        fmt["alphanumeric"] = True

    # "( 18 Numerics)" / "exactly 18 numeric digits" / "18 digits"
    digits = re.search(r"(?i)(?:exactly\s+)?(\d+)\s*(?:numeric|numerics|"
                       r"digits?|numeric\s+digits?)", inside or body)
    if digits:
        fmt["digit_count"] = int(digits.group(1))
        fmt["only_digits"] = True

    if re.search(r"(?i)numeric characters only|only numeric characters"
                 r"|numeric value only", body):
        fmt["only_digits"] = True

    length = re.search(r"(?:not\s+exceed|no\s+more\s+than|maximum\s+of"
                       r"|max(?:imum)?)\s*(\d+)", body)
    if length:
        fmt["max_length"] = int(length.group(1))

    if re.search(r"(?i)(?:no|not\s+include|without|never\s+include)\s+"
                 r"(?:any\s+)?(?:spaces\s+or\s+)?special\s+character", body):
        fmt["no_special"] = True

    if re.search(r"(?i)only lowercase|in\s+lowercase", body):
        fmt["case"] = "lower"
    elif re.search(r"(?i)only uppercase|in\s+uppercase", body):
        fmt["case"] = "upper"

    return fmt


def _parse_allowed_set(lower: str, quotes: list[str], text: str = ""):
    """'should be either A or B' / 'must be updated as A or B and never be C'."""
    forbidden = []

    # "... and never be 'Missing'" / "', Never be \"Missing\"'"
    tail = re.search(r"(?:and\s+)?never\s+be\s*[\"“]?\s*([^\"”]+?)\s*[\"”]", lower)
    if tail:
        forbidden.append(tail.group(1).strip())

    match = re.search(
        r"(?:should\s+be\s+either|should\s+be\s+updated\s+as"
        r"|must\s+be\s+updated\s+as|must\s+be\s+either|should\s+be\s+one\s+of"
        r"|it\s+should\s+be\s+either|either\s+it\s+should\s+be"
        r"|should\s+state|must\s+state|it\s+should\s+be|must\s+be"
        r"|this\s+should\s+be|should\s+be)",
        lower)
    if not match:
        return None

    # Harvest quotes only from the segment AFTER the operative phrase.
    # Taking them from the whole sentence pulled in referenced field names and
    # screen names ("Note Type", "Title", "1003") as if they were permitted
    # values, producing false Invalids.
    if text:
        tail_text = text[match.end():]
        scoped = _value_tokens(tail_text)
        if scoped:
            quotes = scoped
        elif _quoted(tail_text):
            return None      # only field references followed; not a value list

    allowed = [q for q in quotes if q.strip().lower() not in
               {f.lower() for f in forbidden}]
    # "should never be blank, either it should be A or B": blank is a
    # constraint, never a permitted value.
    allowed = [a for a in allowed if a.strip() != ""
               and _norm(a) not in {"blank", "empty", "null"}]
    if len(allowed) < 2:
        return None
    return {"allowed": allowed, "forbidden": forbidden}


def _parse_mutex(text: str, lower: str):
    """'If "X" ... is selected, then "A" or "B" ... should never be selected'."""
    if "never be selected" not in lower and "should never be selected" not in lower:
        return None
    if not lower.strip().startswith("if"):
        return None

    head, _, tail = text.partition(",")
    if "then" in head.lower():                 # comma-less phrasing
        head, _, tail = re.split(r"(?i)\bthen\b", text, maxsplit=1)[0], "", \
            re.split(r"(?i)\bthen\b", text, maxsplit=1)[1]

    trigger = _quoted(head)
    forbidden = _quoted(tail if tail else text)
    if not trigger or not forbidden:
        return None

    # The trigger option is the first quoted token; the screen name (second
    # quoted token, e.g. "1003 Screen") is context, not an option.
    trigger_option = trigger[0]
    forbidden = [f for f in _quoted_values(tail if tail else text)
                 if _norm(f) != _norm(trigger_option)]
    if not forbidden:
        return None
    return {"trigger_option": trigger_option, "forbidden": forbidden}


def _rotate_trailing_condition(text: str) -> str:
    """Move a trailing condition to the front.

    'This should never be "Blank", when "X" states "1" or "2"' carries its
    condition at the END. Left alone, the consequent parsed as an
    unconditional rule and the condition was silently dropped -- which made
    the rule stricter than written and produced false Invalids.
    """
    working = text.strip()
    if re.match(r"(?i)^\s*if\b", working):
        return working
    split = re.split(r"(?i),\s*(?:when|if)\s+(?=\")", working, maxsplit=1)
    if len(split) != 2:
        return working
    consequent, condition = split[0].strip().rstrip("."), split[1].strip()
    if not _quoted(condition):
        return working
    # Normalise the consequent to the "then ..." shape.
    consequent = re.sub(r"(?i)^this\s+(must|should)\s+be\s+updated\s+to\s+",
                        "this should be ", consequent)
    consequent = re.sub(r"(?i)^this\b", "this", consequent)
    return f"If {condition} then {consequent}"


def _normalise_conditional_prose(text: str) -> str:
    """Rewrite spec phrasings into a canonical 'If ... then ...' shape.

    The sheet mixes 'If "A" field ... states "X", then ...' with
    'In "Screen" screen "A" field updated as "X" then ...' and with sentences
    that omit 'then' entirely.
    """
    working = _rotate_trailing_condition(text)

    # 'In "Employment-Income" screen "CPA Letter" field updated as "Yes" then ...'
    lead = re.match(r'(?i)^in\s+"([^"]+)"\s+screen\s+(.*)$', working)
    if lead:
        working = "If " + lead.group(2)

    # '"Citizenship?" field in "1003 screen" states "X" then ...' is a
    # conditional written without a leading 'If'. Without this it fell into the
    # unconditional branch and the screen name leaked into the value list.
    if not re.match(r"(?i)^\s*if\b", working) and \
            re.match(r'(?i)^\s*"[^"]+"\s*(field|fileds|fields)?\s*'
                     r'(in\s*"[^"]*"\s*(screens?)?)?\s*'
                     r'(states?|says?|updated\s+as|is)\b', working) and \
            re.search(r"(?i)\bthen\b", working):
        working = "If " + working.lstrip()

    # '"Non-Borrowing Signor1" field in "Title" Screen Checked then ...'
    # states the trigger with a bare "checked"/"not checked" instead of
    # 'states "X"'. Normalise it so the conditional parser can read it.
    working = re.sub(
        r'(?i)("(?:[^"]*)")\s*(screens?)?\s+(not\s+checked|unchecked|checked)'
        r'\s+(?=then\b)',
        lambda m: f'{m.group(1)} {m.group(2) or ""} states '
                  f'"{"false" if "not" in m.group(3).lower() or "un" in m.group(3).lower() else "true"}" ',
        working)

    # Insert a 'then' before the trailing subject clause. Matching on the
    # subject ("this field should ...", "it should ...") rather than on the
    # text right after the trigger value means any amount of intervening
    # material -- extra value alternatives, screen names -- is tolerated.
    if not re.search(r"(?i)\bthen\b", working) and \
            re.match(r"(?i)^\s*if\b", working):
        subject = list(re.finditer(
            r"(?i)[,;]?\s*\b(this\s+field|this|it|the\s+field)\s+"
            r"(should|must|will|can|may|never)\b", working))
        if subject:
            last = subject[-1]
            working = (working[:last.start()] + " then "
                       + working[last.start():].lstrip(" ,;"))
    return working


def _split_top_level(text: str) -> list[str]:
    """Split on commas and 'and' that sit OUTSIDE quoted spans."""
    parts, buffer, in_quote = [], [], False
    index = 0
    while index < len(text):
        char = text[index]
        if char == '"':
            in_quote = not in_quote
            buffer.append(char)
            index += 1
            continue
        if not in_quote:
            if char == ",":
                parts.append("".join(buffer))
                buffer = []
                index += 1
                continue
            # "&" joins conditions exactly as "and" does. Note this only
            # fires OUTSIDE quotes, so field names containing "&"
            # ("Profit & Loss Type") are untouched.
            match = re.match(r"(?i)\s+(?:and|&)(?:\s+if)?\s+(?:the\s+)?",
                             text[index:])
            if match:
                parts.append("".join(buffer))
                buffer = []
                index += match.end()
                continue
        buffer.append(char)
        index += 1
    parts.append("".join(buffer))
    return [p.strip() for p in parts if p.strip()]


def _parse_condition_segment(segment: str):
    """Turn one antecedent segment into {ref_field, values, negate, ...}.

    Handles quoted values, slash-separated alternatives and bare numbers:
        "Purpose" field states "Refinance"
        "Other Lien Position" Field is "1st"/ "Existing 2nd"/ "3rd"
        "# of Borrowers" field is 4 in "1003" screen
    """
    tokens = _quoted_values(segment)
    if not tokens:
        return None
    ref_field = tokens[0]
    values = [t for t in tokens[1:] if t]

    if not values:
        # Value supplied without quotes. Capture the WHOLE trailing phrase:
        # 'states other than Debt Service Coverage Ratio' must yield the full
        # name, not just 'Debt' -- a truncated value never matches, and under
        # a negated condition that silently fires the rule on every row.
        stripped = re.sub(r'(?i)\bin\s*"[^"]*"\s*(screen|screens|tab)?', " ",
                          segment)
        bare = re.search(r"(?i)(?:states?|says?|is|mentioned\s+as|updated\s+as)\s+"
                         r"(?:other\s+than\s+)?(.+)$", stripped)
        if bare:
            candidate = bare.group(1).strip().strip('".,;').strip()
            candidate = re.sub(r"(?i)\s+(field|screen)$", "", candidate).strip()
            if candidate and _norm(candidate) not in {"", "in", "the", "a",
                                                      "selected", "blank"}:
                values = [candidate]
    if not values:
        return None

    return {
        "ref_field": ref_field,
        "ref_values": values,
        "negate": bool(re.search(r"(?i)\bother\s+than\b", segment)),
        "starts_with": "starts with" in segment.lower(),
    }


def _parse_conditional(text: str, lower: str, owner_field: str = ""):
    """'If "<ref>" ... states/updated as "<v>" ... then <consequent>'."""
    if not re.match(r"^\s*if\b", lower):
        return None
    split = re.split(r"(?i)\bthen\b", text, maxsplit=1)
    if len(split) != 2:
        return None
    antecedent, consequent = split[0], split[1]
    ante_low, cons_low = antecedent.lower(), consequent.lower()

    quotes = _quoted(antecedent)
    if not quotes:
        return None

    # "if any drop down selected" merely restates the list above it; it is not
    # a second condition. Removing it keeps the segment count honest.
    antecedent = re.sub(r"(?i)\.?\s*if\s+any\s+drop\s*down\s+selected\s*",
                        " ", antecedent).strip()
    ante_low = antecedent.lower()

    segments = _split_top_level(re.sub(r"(?i)^\s*if\s+", "", antecedent))
    conditions = []
    for segment in segments:
        parsed = _parse_condition_segment(segment)
        if parsed:
            conditions.append(parsed)
            continue
        # A segment with quoted tokens but no verb is a continuation of the
        # previous condition's value list: 'states "A", "B", or "C"'.
        # Treating it as a new condition made the whole clause unparseable.
        tokens = _quoted_values(segment)
        verbless = not re.search(r"(?i)\b(states?|says?|is|was|updated|"
                                 r"mentioned|selected|checked)\b", segment)
        if tokens and verbless and conditions:
            conditions[-1]["ref_values"].extend(
                t for t in tokens if t not in conditions[-1]["ref_values"])

    if not conditions:
        return None

    # Segments that carried no field of their own (pure prose) are dropped
    # above; if any real segment failed to parse, do not guess.
    meaningful = [seg for seg in segments
                  if _quoted_values(seg)
                  and re.search(r"(?i)\b(states?|says?|is|was|updated|"
                                r"mentioned|selected|checked)\b", seg)]
    if len(conditions) < len(meaningful):
        return None

    ref_field = conditions[0]["ref_field"]
    values = conditions[0]["ref_values"]
    starts_with = conditions[0]["starts_with"]
    negate = conditions[0]["negate"]
    cons_quotes = _quoted_values(consequent)

    # A consequent that states a character format rather than a value:
    # 'then this needs to be updated ( 18 Numerics)'. Rewriting this as a bare
    # not-blank rule would silently drop the 18-digit requirement.
    consequent_format = _extract_format_constraints(consequent)
    if consequent_format:
        family = "COND_FORMAT"
        params = {"format": consequent_format,
                  "require_value": bool(
                      re.search(r"(?i)updated|provided|populated|entered",
                                consequent))}
        params.update({
            "ref_field": ref_field, "ref_values": values,
            "starts_with": starts_with, "negate": negate,
            "extra_conditions": conditions[1:],
        })
        return family, params

    # A consequent that names a field explicitly:
    #   then "Amount of Other Lien" must not be blank
    # When that name is the row's own field, the rule is simply about "this".
    named = re.match(r'(?i)^\s*,?\s*"([^"]+)"\s*(?:field)?\s*'
                     r'(must|should|needs?\s+to)\b(.*)$', consequent.strip())
    if named:
        subject_name = named.group(1).strip()
        remainder = f"this {named.group(2)}{named.group(3)}"
        if _norm(subject_name) == _norm(owner_field):
            consequent = remainder
            cons_low = consequent.lower()
            cons_quotes = _quoted_values(consequent)
        else:
            inner = Rule(field=subject_name, source="", kind="",
                         text=f"This {named.group(2)}{named.group(3)}")
            inner = parse_clause(inner)
            if inner.family not in ("NOT_AUTOMATED", "SPEC_MALFORMED"):
                params = {"subject": subject_name,
                          "inner_family": inner.family,
                          "inner_params": inner.params,
                          "inner_text": inner.text,
                          "ref_field": ref_field, "ref_values": values,
                          "starts_with": starts_with, "negate": negate,
                          "extra_conditions": conditions[1:]}
                return "COND_OTHER_FIELD", params

    # Consequent shape.
    # "should be either \"Yes\" or \"No\" and never be \"blank\"" enumerates the
    # permitted values; the trailing "never be blank" is a restatement, not a
    # forbidden-value list. Checking never-be first inverted the rule.
    allowed_cons = re.search(r"(?i)(?:should|must)\s+be\s+(?:either|one\s+of)"
                             r"|updated\s+to\s+either", consequent)
    if allowed_cons and len(cons_quotes) >= 2:
        permitted = [q for q in cons_quotes
                     if _norm(q) not in {"blank", "empty", "null"}]
        if len(permitted) >= 2:
            family = "COND_ALLOWED_SET"
            params = {"allowed": permitted}
            params.update({
                "ref_field": ref_field,
                "ref_values": values,
                "starts_with": starts_with,
                "negate": negate,
                "extra_conditions": conditions[1:],
            })
            if len(re.findall(r"(?i)\bif\b", antecedent)) > 1:
                return None
            return family, params

    # "must not equal \"Missing\"" is the same shape as "never be".
    if re.search(r"(?i)must\s+not\s+equal|should\s+not\s+equal", cons_low) \
            and re.search(r"(?i)(must|should)\s+equal", cons_low):
        # Both an expected value and a forbidden one: the expected wins.
        expected = re.search(r'(?i)(?:must|should)\s+equal\s*"([^"]+)"',
                             consequent)
        if expected:
            family = "COND_EQUALS"
            params = {"expected": [expected.group(1).strip()]}
            params.update({
                "ref_field": ref_field, "ref_values": values,
                "starts_with": starts_with, "negate": negate,
                "extra_conditions": conditions[1:],
            })
            return family, params

    if re.search(r"never\s+be", cons_low) or re.search(r"not\s+be", cons_low):
        target = cons_quotes[0] if cons_quotes else ""
        if _norm(target) in {"blank", "empty"} or not cons_quotes:
            family = "COND_NOT_BLANK"
            params = {}
        else:
            family = "COND_NOT_EQUALS"
            params = {"forbidden": cons_quotes}
    elif re.search(r"should\s+(?:always\s+)?be|must\s+(?:always\s+)?be"
                   r"|it\s+should|may\s+be|should\s+contain"
                   r"|(?:must|should|will)\s+equal|will\s+be|needs?\s+to\s+be"
                   r"|update(?:d)?\s+as|should\s+\"?checked", cons_low):
        if not cons_quotes:
            # Consequents sometimes name the value without quotes
            # ("then this should be Present"). Take the trailing phrase.
            bare = re.search(r"(?i)(?:should|must|update(?:d)?\s+as)"
                             r"\s+(?:always\s+)?(?:be\s+)?([A-Za-z][\w /&+-]*)",
                             consequent)
            if not bare:
                return None
            candidate = bare.group(1).strip().rstrip(".")
            if len(candidate) > 40 or _norm(candidate) in {"applicable", "same"}:
                return None
            cons_quotes = [candidate]
        if _norm(cons_quotes[0]) in {"blank", "empty"}:
            family = "COND_MUST_BE_BLANK"
            params = {}
        else:
            family = "COND_EQUALS"
            params = {"expected": cons_quotes}
    else:
        return None

    params.update({
        "ref_field": ref_field,
        "ref_values": values,
        "starts_with": starts_with,
        "negate": negate,
        # Every condition must hold for the rule to apply.
        "extra_conditions": conditions[1:],
    })
    return family, params


def parse_clause(rule: Rule) -> Rule:
    text = _normalise_conditional_prose(rule.text)
    lower = text.lower()
    quotes = _quoted(text)

    # An odd number of double quotes means the spec sentence itself is
    # malformed (e.g. 'states "120" or 180" or "240"'). Parsing it would
    # silently mis-read the value list, so report it instead.
    if text.count('"') % 2 == 1:
        rule.family = "SPEC_MALFORMED"
        return rule

    # --- year must match another field's year -------------------------------
    # "Year should not be before or after the \"Note Date\" fields in \"Note\"
    #  Screen" means: the YEAR of this date must equal the year of Note Date.
    # No existing family expresses this -- MATCH_FIELD would compare the whole
    # date, which is a stricter and different rule.
    year_match = re.search(
        r"(?i)\byears?\b.*?(?:should|must)\s+(?:not\s+be\s+(?:before\s+or\s+"
        r"after|after\s+or\s+before)|be\s+the\s+same\s+as|equal|match)"
        r".*?\"([^\"]+)\"", text)
    if year_match:
        target = year_match.group(1).strip()
        if "screen" not in target.lower():
            rule.family = "YEAR_MATCHES_FIELD"
            rule.params = {"ref_field": target}
            return rule

    # --- two fields agreeing as the condition -------------------------------
    # 'If "Lender Name" field and "Loan Origination Company Name" field ...
    #  matches then this should be same as "Lender company NMLS ID"'
    # "are same" / "are different" is the same test as "match" / "do not
    # match"; without this the second field name was consumed as a literal
    # VALUE and the rule could never fire.
    agree = re.search(
        r'(?i)^\s*if\s+"([^"]+)"\s*(?:field)?\s*(?:&|and)\s*"([^"]+)"\s*'
        r'(?:field)?.*?\bare\s+(same|different)\b\s*,?\s*(?:then)?\s*,?\s*'
        r'(.*)$', text)
    if agree:
        consequent_text = agree.group(4)
        target = re.search(r'(?i)(?:same\s+as|match(?:es)?)\s*(?:with\s+)?'
                           r'(?:be\s+)?(?:the\s+)?"([^"]+)"', consequent_text)
        expected = _quoted_values(consequent_text)
        if target or expected:
            rule.family = "FIELDS_AGREE"
            rule.params = {
                "left": agree.group(1).strip(),
                "right": agree.group(2).strip(),
                "negate": agree.group(3).lower() == "different",
                "ref_field": target.group(1).strip() if target else None,
                "expected": None if target else expected[:1],
            }
            return rule

    pair = re.search(
        r'(?i)^\s*if\s+"([^"]+)"\s*(?:field)?\s*and\s+"([^"]+)"\s*'
        r'(?:field)?.*?\bmatch(?:es)?\b\s*,?\s*(?:then)?\s*,?\s*(.*)$',
        text)
    if pair:
        # Detect the negation on the ANTECEDENT only. A lazy .*? in the
        # pattern above would otherwise consume "did not" before an optional
        # capture group could see it.
        head = text[:pair.start(3)] if pair.lastindex >= 3 else text
        negated = bool(re.search(r"(?i)\b(did|do|does)\s+not\s+match", head))
        consequent = pair.group(3)
        target = re.search(r'(?i)(?:same\s+as|match(?:es)?)\s*(?:with\s+)?'
                           r'(?:be\s+)?(?:the\s+)?"([^"]+)"', consequent)
        if target:
            rule.family = "FIELDS_MATCH_THEN_MATCH"
            rule.params = {"left": pair.group(1).strip(),
                           "right": pair.group(2).strip(),
                           "ref_field": target.group(1).strip(),
                           "negate": negated}
            return rule

    # --- between two other dates --------------------------------------------
    between_fields = re.search(
        r"(?i)in\s*betwe+n\s+\"([^\"]+)\".*?\band\b\s*"
        r"(?:(\d+)\s*(day|week|month|year)s?\s*(before|after)\s*)?"
        r"(?:the\s+)?\"([^\"]+)\"", text)
    if between_fields and not lower.startswith("if"):
        lower_field = between_fields.group(1).strip()
        upper_field = between_fields.group(5).strip()
        if ("screen" not in lower_field.lower()
                and "screen" not in upper_field.lower()):
            rule.family = "DATE_BETWEEN"
            rule.params = {
                "lower_field": lower_field,
                "upper_field": upper_field,
                "upper_offset": int(between_fields.group(2) or 0),
                "upper_unit": (between_fields.group(3) or "day").lower(),
                "upper_direction": (between_fields.group(4) or "before").lower(),
            }
            return rule

    # --- symmetric window around another date -------------------------------
    around = re.search(
        r"(?i)within\s+(\d+)\s*(?:business\s+)?(day|week|month|year)s?\s+"
        r"(?:before\s+or\s+after|either\s+side\s+of|of)\s+(?:the\s+)?"
        r"\"([^\"]+)\"", text)
    if around and not lower.startswith("if"):
        rule.family = "DATE_AROUND"
        rule.params = {"count": int(around.group(1)),
                       "unit": around.group(2).lower(),
                       "ref_field": around.group(3).strip()}
        return rule

    # --- maximum interval from another date ---------------------------------
    # "Must not be more than 3 months after the \"Note Date\"".
    # Without this the clause fell through to a numeric bound and then to
    # NOT_EQUALS, both of which produced wrong verdicts.
    within = re.search(
        r"(?i)(?:not|never|no)\s+be\s+more\s+than\s+(\d+)\s*"
        r"(day|week|month|year)s?\s*(after|from|before|prior\s+to)\s*"
        r"(?:the\s*)?\"([^\"]+)\"", text)
    if within:
        rule.family = "DATE_WITHIN"
        rule.params = {
            "count": int(within.group(1)),
            "unit": within.group(2).lower(),
            "direction": ("before" if within.group(3).lower().startswith("prior")
                          or within.group(3).lower() == "before" else "after"),
            "ref_field": within.group(4).strip(),
        }
        return rule

    # --- date offset from another field -------------------------------------
    # "Must be always 1 year from the \"Effective Date\" field"
    offset = re.search(
        r"(?i)\b(\d+)\s*(year|month)s?\s+from\s+(?:the\s+)?\"([^\"]+)\"",
        text)
    if not offset:
        next_month = re.search(
            r"(?i)next\s+month\s+of\s+(?:the\s+)?\"([^\"]+)\"", text)
        if next_month:
            rule.family = "DATE_OFFSET"
            rule.params = {"count": 1, "unit": "month",
                           "ref_field": next_month.group(1).strip()}
            return rule
        worded = re.search(
            r"(?i)exactly\s+(one|two|three|1|2|3)\s+(year|month)s?\s+after"
            r"\s+(?:the\s+)?\"([^\"]+)\"", text)
        if worded:
            numbers = {"one": 1, "two": 2, "three": 3}
            offset = type("M", (), {
                "group": staticmethod(lambda i, w=worded, n=numbers: (
                    str(n.get(w.group(1).lower(), w.group(1))) if i == 1
                    else w.group(i)))})()
    if offset and not lower.startswith("if"):
        rule.family = "DATE_OFFSET"
        rule.params = {
            "count": int(offset.group(1)),
            "unit": offset.group(2).lower(),
            "ref_field": offset.group(3).strip(),
        }
        return rule

    # --- minimum age --------------------------------------------------------
    age = re.search(r"(?i)must be at least\s+(\d+)\s+years?\s+old"
                    r"|age must be (?:greater than or equal to|at least)\s+"
                    r"(\d+)\s+years?", text)
    if age:
        rule.family = "MIN_AGE"
        rule.params = {"years": int(age.group(1) or age.group(2))}
        return rule

    # --- date comparison against another field ------------------------------
    # "This should be before the \"Note Date\" field in the \"Note\" screen".
    # Rephrasing cannot express this, so it needs its own family.
    if not lower.startswith("if"):
        compare = re.search(
            r"(?i)\b(?:should|must)\s+(?:be\s+)?"
            r"(before|after|earlier\s+than|later\s+than|prior\s+to|"
            r"greater\s+than|less\s+than|on\s+or\s+before|on\s+or\s+after|"
            r"not\s+(?:be\s+)?after|not\s+(?:be\s+)?before)\s+"
            r"(?:the\s+)?\"([^\"]+)\"",
            text)
        if compare:
            phrase = " ".join(compare.group(1).lower().split())
            target = compare.group(2).strip()
            # The reference must be a FIELD, not a threshold. Adding
            # "greater than" for 'greater than the "Note Date" field' also
            # swallowed 'greater than "0"', treating 0 as a field name.
            is_number = re.fullmatch(r"[0-9][0-9,.]*\s*%?", target) is not None
            if "screen" not in target.lower() and not is_number:
                if phrase == "greater than":
                    direction, allow_equal = "after", False
                elif phrase == "less than":
                    direction, allow_equal = "before", False
                elif phrase in ("before", "earlier than", "prior to"):
                    direction, allow_equal = "before", False
                elif phrase in ("after", "later than"):
                    direction, allow_equal = "after", False
                elif phrase in ("on or before", "not after", "not be after"):
                    direction, allow_equal = "before", True
                else:
                    direction, allow_equal = "after", True
                rule.family = "DATE_COMPARE"
                rule.params = {"ref_field": target, "direction": direction,
                               "allow_equal": allow_equal}
                return rule

    # --- cross-field equality ---------------------------------------------
    # "It should always match with \"Title Policy Insurer\" field in
    #  \"Miscellaneous\" screen" / "It should be same as \"X\" in \"Y\" screen"
    same_as = re.search(
        r"(?i)(?:always\s+)?(?:match(?:es)?(?:\s+with)?|be\s+same\s+as"
        r"|same\s+as\s+be|be\s+the\s+same\s+as|equal\s+to)\s+"
        r"(?:the\s+)?\"([^\"]+)\"",
        text)
    if same_as and not lower.startswith("if"):
        rule.family = "MATCH_FIELD"
        rule.params = {"ref_field": same_as.group(1).strip()}
        return rule

    # --- assertion about a DIFFERENT field ---------------------------------
    # '"Purpose" field in "1003" screen should never be "Refinance"' is a
    # constraint on Purpose, not on the row it is attached to. Attributing it
    # to this row produced false Invalids (e.g. every FTHB row).
    other = re.match(
        r'(?i)^\s*"([^"]+)"\s*(?:field)?\s*(?:in\s*"[^"]*"\s*(?:screen)?)?'
        r'\s*,?\s*(should|must)\b(.*)$', text)
    if other and not lower.startswith("if"):
        subject, _, remainder = other.group(1).strip(), other.group(2), other.group(3)
        inner = Rule(field=rule.field, source=rule.source, kind=rule.kind,
                     text=f"This should{remainder}")
        inner = parse_clause(inner)
        if inner.family not in ("NOT_AUTOMATED", "SPEC_MALFORMED"):
            rule.family = "OTHER_FIELD"
            rule.params = {"subject": subject, "inner_family": inner.family,
                           "inner_params": inner.params,
                           "inner_text": inner.text}
            return rule

    # --- unconditional families -------------------------------------------
    if not lower.startswith("if") and "if " not in lower[:12]:
        # US month-first date format. Checked BEFORE the generic date rule,
        # which accepts ISO and day-first orders too.
        if re.search(r"(?i)\bus\s+date\s+format\b|\bmm\s*[/-]\s*dd\s*[/-]\s*yyyy",
                     text):
            rule.family = "US_DATE_FORMAT"
            return rule

        if "valid date" in lower or re.search(r"must be a valid\b", lower):
            rule.family = "VALID_DATE"
            return rule

        plain = re.search(r"(?i)^(?:this|it|the\s+field|field|value)\s+"
                          r"(?:should|must)\s+be\s+\"", text)
        if plain and quotes and not re.search(r"(?i)\beither\b|\bor\b", lower):
            rule.family = "ALWAYS_EQUALS"
            rule.params = {"expected": [quotes[0]]}
            return rule

        # "The field should always contain multiple numeric values
        #  (e.g., 112, 118, 267)" -- the cell holds a LIST, and must carry
        #  more than one number. The parenthetical is an illustration, not
        #  a constraint, so it is stripped before matching.
        multi = re.search(r"(?i)multiple\s+(?:numeric\s+values?|numbers?|"
                          r"numerics?)"
                          r"|more\s+than\s+(?:one|1)\s+(?:numeric|number)",
                          re.sub(r"\([^)]*\)", " ", text))
        if multi:
            rule.family = "MULTI_NUMERIC"
            rule.params = {"minimum_count": 2}
            return rule

        # "It must be a positive #" / "positive number always"
        if re.search(r"(?i)\bpositive\s*(#|number|value)", text):
            rule.family = "POSITIVE_NUMBER"
            rule.params = {"allow_zero": bool(
                re.search(r"(?i)or\s+zero|zero\s+or", text))}
            return rule

        # "This field must contain a whole number."
        if re.search(r"(?i)must contain a whole number|whole number only",
                     text):
            rule.family = "WHOLE_NUMBER"
            return rule

        # "must contain a decimal value between \"0.01 and 1.00\""
        between = re.search(
            r"(?i)decimal value between\s*\"?\s*([0-9.]+)\s*(?:and|to|-)\s*"
            r"([0-9.]+)", text)
        if between:
            rule.family = "VALUE_RANGE"
            rule.params = {"low": float(between.group(1)),
                           "high": float(between.group(2))}
            return rule

        # "Must be in Percentage format (6.897%)"
        if re.search(r"(?i)in percentage format", text):
            rule.family = "PERCENTAGE_FORMAT"
            return rule

        # "Should be the 1st day of a month"
        if re.search(r"(?i)(1st|first) day of (a |the )?month", text):
            rule.family = "FIRST_OF_MONTH"
            return rule

        # Permitted fractional parts, e.g. month-fractions of a year.
        if re.search(r"(?i)after\s+whole\s+number|decimal portion of the value"
                     r"\s+must be one of", text):
            decimals = re.findall(r"0?\.\d{1,2}", text)
            if decimals:
                rule.family = "DECIMAL_SET"
                rule.params = {"allowed": sorted({round(float(d), 2)
                                                  for d in decimals})}
                return rule

        # Character-format constraints. A single sentence can carry several
        # ("Should not exceed 45 Alphanumeric and must not include Special
        # Characters"), so they are collected into one composite rule.
        # Parentheticals are stripped first: "(Example: \"-\")" illustrates
        # what is forbidden and must not be read as a constraint itself.
        body = re.sub(r"\([^)]*\)", " ", lower)
        fmt = {}

        if "alphanumeric" in body:
            fmt["alphanumeric"] = True

        # "must contain exactly 10 numeric digits"
        exact = re.search(r"(?i)exactly\s+(\d+)\s+(?:numeric\s+)?digits", body)
        if exact:
            fmt["digit_count"] = int(exact.group(1))
            fmt["only_digits"] = True

        # "must contain numeric characters only" / "only numeric characters"
        if re.search(r"(?i)numeric characters only|only numeric characters"
                     r"|must contain a valid numeric value", body):
            fmt["only_digits"] = True

        if re.search(r"(?i)without any spaces or special character", body):
            fmt["no_special"] = True

        if (re.search(r"\bin\s+\"?lowercase", body) or "lower case" in body
                or re.search(r"(?i)only lowercase", body)):
            fmt["case"] = "lower"
        elif (re.search(r"\bin\s+\"?uppercase", body) or "upper case" in body
              or re.search(r"(?i)only uppercase", body)):
            fmt["case"] = "upper"

        # A digit mask such as 111-111-1111 or xxx-xx-xxxx describes the exact
        # punctuation layout the value must follow.
        mask = re.search(r"(?:format\s*(?:of|is|:)?\s*)"
                         r"([0-9x\*]{2,}(?:[-/.][0-9x\*]{2,})+)", body)
        if mask:
            fmt["mask"] = mask.group(1)

        length = re.search(r"(?:not\s+exceed|no\s+more\s+than|maximum\s+of"
                           r"|max(?:imum)?)\s*(\d+)", body)
        if length:
            fmt["max_length"] = int(length.group(1))

        if re.search(r"(?:no|not\s+include|without|never\s+include)\s+"
                     r"special\s+character", body):
            # Skip when the same sentence prescribes a punctuated format
            # (e.g. "must be in the format 111-111-1111"), which contradicts it.
            if not re.search(r"format\s*[:\-]?\s*[\d\*]+[-/][\d\*]", body):
                fmt["no_special"] = True

        if re.search(r"only\s+numeric\s+digits|only\s+digits|numeric\s+only",
                     body):
            fmt["only_digits"] = True

        digits = re.search(r"total\s+(\d+)\s+numeric", body)
        if digits:
            fmt["digit_count"] = int(digits.group(1))

        if fmt:
            rule.family = "FORMAT"
            rule.params = fmt
            return rule

        # Any other purely descriptive note imposes no testable constraint.
        if re.match(r"^(value can be|it can be|can be)\b", lower) and \
                "must" not in lower and "should" not in lower:
            rule.family = "INFORMATIONAL"
            return rule

        # Strip parentheticals first: 'never be "0" (1 or more than 1)' is a
        # NOT_EQUALS rule, and the aside must not be read as a minimum.
        outside_parens = re.sub(r"\([^)]*\)", " ", lower)
        # A negated comparison ("should NOT be greater than 30k") is a
        # maximum, not a minimum. Leave it to the MAX_VALUE branch below --
        # matching "greater than" here inverted the rule.
        negated_bound = re.search(
            r"(?i)(?:never|not|no)\s+be\s+"
            r"(?:greater|more|higher|larger|lesser|less|lower|smaller)\s+than",
            outside_parens)

        greater = re.search(r"(?:should|must)\b[^.]*?"
                            r"(?:greater than|at least)\s*\"?\$?\s*"
                            r"([0-9][0-9,\.]*\s*(?:k|m|mm|bn|b)?)(?![a-z])",
                            outside_parens)
        if greater and not negated_bound and "year" not in outside_parens:
            threshold = _parse_magnitude(greater.group(1))
            if threshold is not None:
                rule.family = "GREATER_THAN"
                rule.params = {"minimum": threshold,
                               "literal": greater.group(1).strip()}
                return rule

        digits = re.search(r"exactly\s+(\d+)\s+digits", lower)
        if digits:
            rule.family = "EXACT_DIGITS"
            rule.params = {"count": int(digits.group(1))}
            return rule

        if "future date" in lower and re.search(r"not|never", lower):
            rule.family = "NOT_FUTURE_DATE"
            return rule

        min_year = re.search(r"year cannot be earlier than\s*\"?(\d{4})", lower)
        if min_year:
            rule.family = "MIN_YEAR"
            rule.params = {"year": int(min_year.group(1))}
            return rule

        allowed = _parse_allowed_set(lower, _value_tokens(text), text)
        if allowed:
            rule.family = "ALLOWED_SET"
            rule.params = allowed
            return rule

        always = re.search(r"(?:should\s+(?:be\s+)?always(?:\s+be)?"
                           r"|always\s+be)", lower)
        if always and quotes:
            # Only quotes after "always" are candidate values; anything before
            # it is context (a referenced field or screen name).
            positives = [q for q in _value_tokens(text[always.end():])
                         if _norm(q) not in {"blank", "empty"}]
            # A single trailing formatting note ("Lowercase", "Uppercase") is a
            # presentation instruction, not an enumerable value.
            if positives and not (len(positives) == 1 and _norm(positives[0])
                                  in {"lowercase", "uppercase", "propercase",
                                      "titlecase", "alphanumeric"}):
                rule.family = "ALWAYS_EQUALS"
                rule.params = {"expected": positives}
                return rule
            # A lone formatting word ("Lowercase") is a character-format rule;
            # fall through to the FORMAT branch rather than giving up.

        # Numeric bounds. These must be tested before the generic "never be"
        # branch, which would otherwise treat the threshold as a forbidden
        # literal string ("never be lesser than 30k" -> forbidden == '30k').
        bound_text = re.sub(r"\([^)]*\)", " ", text)
        # "not be more than 3 months after the \"Note Date\"" is a date
        # interval, not a numeric maximum. Reading it as a number produced a
        # false Invalid on a perfectly good date.
        date_interval = re.search(
            r"(?i)\d+\s*(day|week|month|year)s?\s*(after|before|from|prior)",
            bound_text)
        if date_interval:
            bound_text = ""
        maximum = re.search(
            r"(?i)(?:never|not|no)\s+be\s+(?:greater|more|higher|larger)\s+than"
            r"\s*\"?\$?\s*([0-9][0-9,\.]*\s*(?:k|m|mm|bn|b)?)", bound_text)
        minimum = re.search(
            r"(?i)(?:never|not|no)\s+be\s+(?:lesser|less|lower|smaller)\s+than"
            r"\s*\"?\$?\s*([0-9][0-9,\.]*\s*(?:k|m|mm|bn|b)?)", bound_text)
        if maximum or minimum:
            source = maximum or minimum
            threshold = _parse_magnitude(source.group(1))
            if threshold is not None:
                rule.family = "MAX_VALUE" if maximum else "MIN_VALUE"
                rule.params = {"threshold": threshold,
                               "literal": source.group(1).strip()}
                return rule

        # A date interval that reached here is not a forbidden-value rule;
        # treating the referenced field name as a literal value was wrong.
        if re.search(r"(?i)\d+\s*(day|week|month|year)s?\s*"
                     r"(after|before|from|prior)", lower):
            rule.family = "NOT_AUTOMATED"
            return rule

        if re.search(r"never\s+be|(?:should|must)\s+not\s+be", lower):
            # If the sentence also enumerates permitted values, it is an
            # allowed-set rule that _parse_allowed_set failed to shape; do not
            # invert it into a forbidden list (that produced false Invalids
            # such as "Value 'No' is not permitted (Yes / No)").
            if re.search(r"either|should\s+state|should\s+be\s+updated"
                         r"|must\s+be\s+updated|one\s+of", lower):
                rule.family = "NOT_AUTOMATED"
                return rule
            targets = [q for q in _value_tokens(text) if q.strip() != ""]
            # If every quoted token was a field reference, this is a
            # cross-field rule with no family yet -- not a forbidden-value rule.
            if not targets and _quoted(text):
                rule.family = "NOT_AUTOMATED"
                return rule
            blanks = [t for t in targets if _norm(t) in {"blank", "empty", "null"}]
            others = [t for t in targets if _norm(t) not in
                      {"blank", "empty", "null"}]
            if blanks and not others:
                rule.family = "NOT_BLANK"
                return rule
            if others:
                rule.family = "NOT_EQUALS"
                rule.params = {"forbidden": others,
                               "also_not_blank": bool(blanks)}
                return rule
            if not targets:                       # "It should never be Blank"
                rule.family = "NOT_BLANK"
                return rule

    # --- conditional families ---------------------------------------------
    mutex = _parse_mutex(text, lower)
    if mutex:
        rule.family = "MUTEX"
        rule.params = mutex
        return rule

    conditional = _parse_conditional(text, lower, rule.field)
    if conditional:
        rule.family, rule.params = conditional
        return rule

    rule.family = "NOT_AUTOMATED"
    return rule


def load_rules(path) -> dict[str, list[Rule]]:
    """Read the spec workbook and return {normalised field name: [Rule, ...]}."""
    workbook = openpyxl.load_workbook(path, data_only=True)
    sheet = workbook[SPEC_SHEET] if SPEC_SHEET in workbook.sheetnames \
        else workbook.worksheets[0]

    header = {}
    for cell in sheet[1]:
        if cell.value is not None:
            header[_clean(cell.value)] = cell.column

    for required in (SPEC_FIELD_COL, SPEC_COND_COL):
        if required not in header:
            raise ValueError(
                f"Condition spec is missing column {required!r}. "
                f"Found: {list(header)}")

    rules: dict[str, list[Rule]] = {}
    total = automated = 0
    for row in range(2, sheet.max_row + 1):
        field_name = _clean(sheet.cell(row=row, column=header[SPEC_FIELD_COL]).value)
        if not field_name:
            continue
        condition = sheet.cell(row=row, column=header[SPEC_COND_COL]).value
        source = _clean(sheet.cell(
            row=row, column=header[SPEC_SOURCE_COL]).value) \
            if SPEC_SOURCE_COL in header else ""
        kind = _clean(sheet.cell(
            row=row, column=header[SPEC_KIND_COL]).value) \
            if SPEC_KIND_COL in header else ""

        pending_guard = None
        for clause in _split_clauses(condition):
            rule = parse_clause(Rule(field=field_name, source=source,
                                     kind=kind, text=clause))

            # A numbered cell often reads:
            #   1. If "Gap Letter" ... is "Yes" then it should never be "Blank"
            #   2. It should be greater than "0"
            # Clause 2 is a continuation of clause 1's condition, not a
            # standalone rule. Evaluating it unconditionally reported valid
            # rows as Invalid (gap months = 0 while no gap letter exists).
            if rule.family in CONDITIONAL_FAMILIES:
                pending_guard = {
                    "ref_field": rule.params.get("ref_field"),
                    "ref_values": rule.params.get("ref_values"),
                    "starts_with": rule.params.get("starts_with", False),
                    "negate": rule.params.get("negate", False),
                    "extra_conditions": rule.params.get("extra_conditions") or [],
                }
            elif (pending_guard and rule.family in GUARDABLE_FAMILIES
                  and not re.search(r"(?i)\balways\b", rule.text)):
                rule.params = dict(rule.params)
                rule.params["guard"] = pending_guard

            rules.setdefault(_norm(field_name), []).append(rule)
            total += 1
            automated += rule.family not in ("NOT_AUTOMATED", "SPEC_MALFORMED")

    log.info("Condition spec: %d clauses over %d fields; %d automated (%.0f%%).",
             total, len(rules), automated,
             100 * automated / total if total else 0)
    return rules


# --------------------------------------------------------------------------- #
# Field resolution
# --------------------------------------------------------------------------- #

def _owner_prefixes(owner_field: str) -> list[str]:
    """Leading word-prefixes of a field name, longest first.

    'B2 Sex' style labels are also expanded to 'Borrower 2 Sex' so rules
    attached to label-form names still scope to the right borrower.
    """
    clean = _clean(owner_field)
    if " - " in clean:
        clean = clean.rsplit(" - ", 1)[0]

    variants = [clean]
    compact = re.match(r"(?i)^b(\d+)\s*(.*)$", clean)
    if compact:
        variants.append(f"Borrower {compact.group(1)} {compact.group(2)}".strip())
    spaced = re.match(r"(?i)^b(\d+)([A-Z].*)$", clean)
    if spaced:
        variants.append(f"Borrower {spaced.group(1)} {spaced.group(2)}".strip())

    prefixes = []
    for variant in variants:
        words = variant.split()
        for size in range(len(words), 1, -1):
            candidate = " ".join(words[:size])
            if candidate not in prefixes:
                prefixes.append(candidate)
    return prefixes


class FieldIndex:
    """Look up sample values by field name, with borrower-aware resolution."""

    def __init__(self, field_names, values):
        self.by_norm: dict[str, object] = {}
        self.names: list[str] = []
        # Parallel list of normalised names: resolve() scans every field on
        # each miss, and re-normalising them each time dominated runtime.
        self.norm_names: list[str] = []
        self._resolve_cache: dict[tuple, tuple] = {}
        for name, value in zip(field_names, values):
            clean = _clean(name)
            if not clean:
                continue
            self.names.append(clean)
            self.norm_names.append(_norm(clean))
            # Last occurrence wins, matching the rest of the pipeline.
            self.by_norm[_norm(clean)] = value

    def exact(self, name):
        return self.by_norm.get(_norm(name))

    def has(self, name) -> bool:
        return _norm(name) in self.by_norm

    def resolve(self, reference: str, owner_field: str):
        """Cached wrapper; see _resolve_uncached for the lookup rules."""
        key = (reference, owner_field)
        hit = self._resolve_cache.get(key)
        if hit is None:
            hit = self._resolve_uncached(reference, owner_field)
            self._resolve_cache[key] = hit
        return hit

    def _resolve_uncached(self, reference: str, owner_field: str):
        """Find the sample field a rule refers to.

        Tries, in order: exact match; the same borrower prefix as the field the
        rule is attached to ("Borrower 2 " + reference); then a unique
        suffix/substring match. Returns (name, value) or (None, None).
        """
        if self.has(reference):
            return reference, self.exact(reference)

        borrower = re.match(r"(?i)^(borrower\s*\d+|b\d+)\b", _clean(owner_field))
        if borrower:
            scoped = f"{borrower.group(1)} {reference}"
            if self.has(scoped):
                return scoped, self.exact(scoped)

        # "Loan Type (Mortgage Applied For)" in the spec is "Loan Type" in
        # the export; retry without the parenthetical qualifier.
        bare_reference = re.sub(r"\([^)]*\)", " ", str(reference)).strip()
        if bare_reference and bare_reference != str(reference).strip():
            if self.has(bare_reference):
                return bare_reference, self.exact(bare_reference)
            if borrower:
                scoped_bare = f"{borrower.group(1)} {bare_reference}"
                if self.has(scoped_bare):
                    return scoped_bare, self.exact(scoped_bare)

        target = _norm(reference)
        pairs = list(zip(self.names, self.norm_names))
        hits = [n for n, nn in pairs if nn == target]
        if not hits and bare_reference:
            bare_target = _norm(bare_reference)
            hits = [n for n, nn in pairs if nn == bare_target]
        if not hits:
            hits = [n for n, nn in pairs if nn.endswith(target)]
        if not hits:
            hits = [n for n, nn in pairs if target and target in nn]

        if borrower and len(hits) > 1:
            prefix = _norm(borrower.group(1))
            scoped_hits = [h for h in hits if _norm(h).startswith(prefix)]
            if scoped_hits:
                hits = scoped_hits

        if len(hits) == 1:
            return hits[0], self.exact(hits[0])
        if len(hits) > 1:
            # Narrow by the owner field's category, trying progressively
            # shorter leading prefixes: for
            # 'Borrower 3 Ethnicity Visual Observation or Surname' the useful
            # prefix is 'Borrower 3 Ethnicity'.
            for prefix in _owner_prefixes(owner_field):
                scoped = [h for h in hits if _norm(h).startswith(_norm(prefix))]
                if len(scoped) == 1:
                    return scoped[0], self.exact(scoped[0])
                if scoped:
                    hits = scoped
                    break
            exact_tail = [h for h in hits if _norm(h).endswith(_norm(reference))]
            if len(exact_tail) == 1:
                return exact_tail[0], self.exact(exact_tail[0])
            # Still ambiguous: refuse to guess. Picking the shortest name
            # silently resolved a Race rule against the Sex checkbox.
            return None, sorted(hits)
        return None, None

    def checkbox_group(self, owner_field: str, option: str):
        """Resolve a sibling checkbox in the same 'Borrower N Category - ' group.

        The category prefix comes from the owner field: for
        'Borrower 2 Race - Asian' it is 'Borrower 2 Race', and for a rule
        attached to the roll-up field 'Borrower 2 Race' it is that name
        itself. Without this, an option like 'Do not wish to provide this
        information' matched the Race, Sex AND Ethnicity variants, and the
        resolver silently picked one.
        """
        clean = _clean(owner_field)
        prefix = clean.rsplit(" - ", 1)[0] if " - " in clean else clean
        for prefix in [prefix] + _owner_prefixes(owner_field):
            if not prefix:
                continue
            candidate = f"{prefix} - {option}"
            if self.has(candidate):
                return candidate, self.exact(candidate)
            # Tolerate "Do not wish" vs "I do not wish" wording differences,
            # but stay inside this field's own category.
            target = _norm(prefix) + _norm(option)
            matches = [
                name for name in self.names
                if _norm(name).startswith(_norm(prefix))
                and (_norm(name).endswith(_norm(option))
                     or target in _norm(name)
                     or _norm(option) in _norm(name))
            ]
            if len(matches) == 1:
                return matches[0], self.exact(matches[0])
            if len(matches) > 1:
                exact_tail = [m for m in matches
                              if _norm(m).endswith(_norm(option))]
                if len(exact_tail) == 1:
                    return exact_tail[0], self.exact(exact_tail[0])
                return None, sorted(matches)
        return self.resolve(option, owner_field)


# --------------------------------------------------------------------------- #
# Evaluation
# --------------------------------------------------------------------------- #

def _condition_holds(spec, value):
    """Does one antecedent condition hold for the referenced field's value?"""
    values = spec.get("ref_values") or []
    if spec.get("starts_with"):
        held = _starts_with_any(value, values)
        how = f"starts with {' / '.join(values)}"
    elif values:
        held = _match_any(value, values)
        how = f"is {' / '.join(repr(v) for v in values)}"
    else:
        held = _is_true(value)
        how = "is selected"
    if spec.get("negate"):
        held = not held
        how = (f"is anything other than {' / '.join(repr(v) for v in values)}"
               if values else "is not selected")
    return held, how


# Checkbox states are written several ways across the spec and the exports.
CHECKED_WORDS = {"checked", "selected", "true", "yes", "y", "1", "ticked"}
# "blank" is deliberately NOT here: absence of a value is not the same as an
# unchecked box. Treating them as equal made 'No' match a forbidden 'Blank'.
UNCHECKED_WORDS = {"unchecked", "notselected", "notchecked", "false", "no",
                   "n", "0", "unticked"}


def _checkbox_state(text):
    """Return True/False for a checkbox-style token, else None."""
    normalised = _norm(text)
    if normalised in CHECKED_WORDS:
        return True
    if normalised in UNCHECKED_WORDS:
        return False
    return None


def _match_any(value, candidates) -> bool:
    normalised = _norm(value)
    if any(_norm(c) == normalised for c in candidates):
        return True
    # 'unchecked' and 'false' describe the same checkbox state; comparing them
    # as raw strings reported correct data as Invalid.
    value_state = _checkbox_state(value)
    if value_state is None:
        return False
    return any(_checkbox_state(c) is value_state for c in candidates)


def _starts_with_any(value, prefixes) -> bool:
    text = str(value or "").strip().lower()
    return any(text.startswith(str(p).strip().lower()) for p in prefixes if p)


def _evaluate_rule(rule: Rule, value, index: FieldIndex):
    """Return (status, remark). status in Valid / Invalid / N/A / Not Automated."""
    family = rule.family
    params = rule.params

    # An inherited condition gates the whole clause: if the governing field
    # does not match, the rule simply does not apply to this row.
    guard = params.get("guard")
    if guard and guard.get("ref_field"):
        guard_name, guard_value = index.resolve(guard["ref_field"], rule.field)
        if guard_name is None:
            return "Not Automated", (
                f"Could not locate the governing field "
                f"{guard['ref_field']!r} for this rule.")
        triggered, how = _condition_holds(guard, guard_value)
        if not triggered:
            return "N/A - condition not met", (
                f"{guard_name!r} = {str(guard_value)!r}; rule applies only "
                f"when it {how}.")
        for spec in (guard.get("extra_conditions") or []):
            extra_name, extra_value = index.resolve(spec["ref_field"],
                                                    rule.field)
            if extra_name is None:
                return "Not Automated", (
                    f"Could not locate the referenced field "
                    f"{spec['ref_field']!r} for this rule.")
            held, how = _condition_holds(spec, extra_value)
            if not held:
                return "N/A - condition not met", (
                    f"{extra_name!r} = {str(extra_value)!r}; rule applies "
                    f"only when it {how}.")

    if family == "NOT_AUTOMATED":
        return "Not Automated", f"Rule not auto-interpreted: {rule.text}"

    if family == "SPEC_MALFORMED":
        return "Not Automated", (
            f"Condition spec has unbalanced quotation marks and cannot be "
            f"read reliably: {rule.text}")

    if family == "NOT_BLANK":
        if _is_blank_value(value):
            return "Invalid", "Field is blank; the rule requires a value."
        return "Valid", ""

    if family == "NOT_EQUALS":
        if params.get("also_not_blank") and _is_blank_value(value):
            return "Invalid", "Field is blank; the rule requires a value."
        if _match_any(value, params["forbidden"]):
            return "Invalid", (f"Value {str(value)!r} is not permitted "
                               f"({' / '.join(params['forbidden'])}).")
        return "Valid", ""

    if family == "ALWAYS_EQUALS":
        expected = params["expected"]
        if _is_blank_value(value):
            return "Invalid", (f"Field is blank; expected "
                               f"{' or '.join(repr(e) for e in expected)}.")
        if _match_any(value, expected):
            return "Valid", ""
        return "Invalid", (f"Value {str(value)!r} should always be "
                           f"{' or '.join(repr(e) for e in expected)}.")

    if family == "ALLOWED_SET":
        allowed, forbidden = params["allowed"], params.get("forbidden", [])
        if _is_blank_value(value):
            return "Invalid", (f"Field is blank; expected one of "
                               f"{' / '.join(allowed)}.")
        if forbidden and _match_any(value, forbidden):
            return "Invalid", (f"Value {str(value)!r} is explicitly "
                               f"disallowed.")
        if _match_any(value, allowed):
            return "Valid", ""
        return "Invalid", (f"Value {str(value)!r} is not in the allowed set: "
                           f"{' / '.join(allowed)}.")

    if family == "US_DATE_FORMAT":
        from datetime import date as _date, datetime as _datetime
        if _is_blank_value(value):
            return "N/A - blank value", ""

        # A native date cell carries no textual order to violate.
        if isinstance(value, (_datetime, _date)):
            return "Valid", ("Stored as a native date value, so no text format "
                             "applies.")

        text = str(value).strip()
        match = re.fullmatch(r"(\d{1,2})([/-])(\d{1,2})\2(\d{4})", text)
        if not match:
            iso = re.fullmatch(r"(\d{4})([/-])(\d{1,2})\2(\d{1,2})", text)
            if iso:
                return "Invalid", (
                    f"{text!r} is in YYYY-MM-DD order; US format "
                    f"MM/DD/YYYY is required.")
            short = re.fullmatch(r"(\d{1,2})([/-])(\d{1,2})\2(\d{2})", text)
            if short:
                return "Invalid", (
                    f"{text!r} has a 2-digit year; US format MM/DD/YYYY "
                    f"requires 4 digits.")
            return "Invalid", (
                f"{text!r} is not in US date format MM/DD/YYYY.")

        first, _, second, year = (int(match.group(1)), match.group(2),
                                  int(match.group(3)), int(match.group(4)))
        if first > 12:
            return "Invalid", (
                f"{text!r} is day-first: {first} cannot be a month, so this "
                f"is DD/MM/YYYY rather than US MM/DD/YYYY.")
        if second > 31 or second < 1 or first < 1:
            return "Invalid", f"{text!r} is not a valid calendar date."
        try:
            _datetime(year, first, second)
        except ValueError:
            return "Invalid", (
                f"{text!r} is not a valid calendar date "
                f"(month {first}, day {second}).")
        if second <= 12:
            return "Valid", (
                f"Matches US format MM/DD/YYYY. Note {text!r} is also a valid "
                f"day-first date, so the order cannot be confirmed from the "
                f"value alone.")
        return "Valid", ""

    if family == "VALID_DATE":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        parsed, why = _parse_date_for_rule(value)
        if parsed is None:
            return "Invalid", f"Not a valid date: {why}"
        if f"{parsed.year:04d}"[:2] in {"00", "02"}:
            return "Invalid", (f"Year {parsed.year} is invalid "
                               f"(cannot start with 00 or 02).")
        return "Valid", ""

    if family == "YEAR_MATCHES_FIELD":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        name, other_value = index.resolve(params["ref_field"], rule.field)
        if name is None:
            if isinstance(other_value, list):
                return "Not Automated", (
                    f"{params['ref_field']!r} is ambiguous in this file; "
                    f"candidates: {', '.join(other_value[:4])}.")
            return "Not Automated", (
                f"Could not locate the referenced field "
                f"{params['ref_field']!r} in this file.")
        if _is_blank_value(other_value):
            return "N/A - condition not met", (
                f"{name!r} is blank, so the years cannot be compared.")

        this_date, why = _parse_date_for_rule(value)
        if this_date is None:
            return "Invalid", f"Not a valid date: {why}"
        other_date, why_other = _parse_date_for_rule(other_value)
        if other_date is None:
            return "Not Automated", (
                f"{name!r} = {str(other_value)!r} is not a readable date.")

        if this_date.year == other_date.year:
            return "Valid", (f"Year {this_date.year} matches {name!r} "
                             f"({other_date:%m/%d/%Y}).")
        return "Invalid", (
            f"Year {this_date.year} does not match the year of {name!r} "
            f"({other_date.year}, {other_date:%m/%d/%Y}).")

    if family == "FIELDS_AGREE":
        left_name, left_value = index.resolve(params["left"], rule.field)
        right_name, right_value = index.resolve(params["right"], rule.field)
        for label in ("left", "right"):
            if (left_name if label == "left" else right_name) is None:
                return "Not Automated", (
                    f"Could not locate the referenced field "
                    f"{params[label]!r} in this file.")

        agree = _norm(left_value) == _norm(right_value)
        want_agree = not params.get("negate", False)
        if agree != want_agree:
            state = "are the same" if agree else "are different"
            need = "are the same" if want_agree else "are different"
            return "N/A - condition not met", (
                f"{left_name!r} = {str(left_value)!r} and {right_name!r} = "
                f"{str(right_value)!r} {state}; the rule applies only when "
                f"they {need}.")

        how = "are the same" if want_agree else "are different"
        context = f"{left_name!r} and {right_name!r} {how}: "

        if params.get("ref_field"):
            target_name, target_value = index.resolve(params["ref_field"],
                                                      rule.field)
            if target_name is None:
                return "Not Automated", (
                    f"Could not locate the referenced field "
                    f"{params['ref_field']!r} in this file.")
            if _norm(value) == _norm(target_value):
                return "Valid", context + f"this equals {target_name!r}."
            return "Invalid", (context + f"this should equal {target_name!r} "
                               f"({str(target_value)!r}), found "
                               f"{str(value)!r}.")

        expected = params.get("expected") or []
        if not expected:
            return "Not Automated", "No expected value found in the clause."
        if _match_any(value, expected):
            return "Valid", ""
        return "Invalid", (context + f"expected "
                           f"{' or '.join(repr(e) for e in expected)}, "
                           f"found {str(value)!r}.")

    if family == "FIELDS_MATCH_THEN_MATCH":
        left_name, left_value = index.resolve(params["left"], rule.field)
        right_name, right_value = index.resolve(params["right"], rule.field)
        for label, name in (("left", left_name), ("right", right_name)):
            if name is None:
                missing = params["left"] if label == "left" else params["right"]
                return "Not Automated", (
                    f"Could not locate the referenced field {missing!r} "
                    f"in this file.")
        fields_agree = _norm(left_value) == _norm(right_value)
        want_agree = not params.get("negate", False)
        if fields_agree != want_agree:
            state = "match" if fields_agree else "do not match"
            need = "match" if want_agree else "do not match"
            return "N/A - condition not met", (
                f"{left_name!r} = {str(left_value)!r} and {right_name!r} = "
                f"{str(right_value)!r} {state}; the rule applies only when "
                f"they {need}.")
        target_name, target_value = index.resolve(params["ref_field"],
                                                  rule.field)
        if target_name is None:
            return "Not Automated", (
                f"Could not locate the referenced field "
                f"{params['ref_field']!r} in this file.")
        how = "do not match" if params.get("negate") else "match"
        if _norm(value) == _norm(target_value):
            return "Valid", (f"{left_name!r} and {right_name!r} {how}, and "
                             f"this equals {target_name!r}.")
        return "Invalid", (
            f"{left_name!r} and {right_name!r} {how}, so this should equal "
            f"{target_name!r} ({str(target_value)!r}), found {str(value)!r}.")

    if family == "MULTI_NUMERIC":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        text = _display_text(value)
        # Accept a JSON array, or a comma / semicolon / pipe separated list.
        parts = split_multivalue_numbers(text)
        numeric, non_numeric = [], []
        for part in parts:
            if _numeric_value(part) is None:
                non_numeric.append(part)
            else:
                numeric.append(part)

        if non_numeric:
            return "Invalid", (
                f"Value {text!r} contains non-numeric entr"
                f"{'ies' if len(non_numeric) > 1 else 'y'}: "
                + ", ".join(repr(x) for x in non_numeric[:4]) + ".")

        needed = params.get("minimum_count", 2)
        if len(numeric) >= needed:
            return "Valid", (f"Contains {len(numeric)} numeric values.")
        return "Invalid", (
            f"Value {text!r} contains {len(numeric)} numeric value"
            f"{'' if len(numeric) == 1 else 's'}; at least {needed} are "
            f"required.")

    if family == "POSITIVE_NUMBER":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        number = _numeric_value(value)
        if number is None:
            return "Invalid", f"Value {str(value)!r} is not numeric."
        if number > 0 or (params.get("allow_zero") and number == 0):
            return "Valid", ""
        return "Invalid", (f"Value {number:,g} must be a positive number"
                           + (" or zero." if params.get("allow_zero") else "."))

    if family == "WHOLE_NUMBER":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        number = _numeric_value(value)
        if number is None:
            return "Invalid", f"Value {str(value)!r} is not numeric."
        if number == int(number):
            return "Valid", ""
        return "Invalid", (f"Value {number:,g} is not a whole number; a "
                           f"fractional part is not permitted.")

    if family == "VALUE_RANGE":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        number = _numeric_value(value)
        if number is None:
            return "Invalid", f"Value {str(value)!r} is not numeric."
        low, high = params["low"], params["high"]
        if low <= number <= high:
            return "Valid", ""
        return "Invalid", (f"Value {number:,g} is outside the permitted range "
                           f"{low} to {high}.")

    if family == "PERCENTAGE_FORMAT":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        text = str(value).strip()
        number = _numeric_value(text)
        if number is None:
            return "Invalid", (f"Value {text!r} is not a percentage value.")
        if number < 0 or number > 100:
            return "Invalid", (f"Value {number:,g} is outside the 0-100 "
                               f"percentage range.")
        return "Valid", ""

    if family == "FIRST_OF_MONTH":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        parsed, why = _parse_date_for_rule(value)
        if parsed is None:
            return "Invalid", f"Not a valid date: {why}"
        if parsed.day == 1:
            return "Valid", ""
        return "Invalid", (f"{parsed:%m/%d/%Y} is day {parsed.day}; the date "
                           f"must be the 1st of a month.")

    if family == "DECIMAL_SET":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        number = _numeric_value(value)
        if number is None:
            return "Invalid", f"Value {str(value)!r} is not numeric."
        fraction = round(abs(number) - int(abs(number)), 2)
        allowed = params["allowed"]
        if fraction == 0 or any(abs(fraction - a) < 0.005 for a in allowed):
            return "Valid", ""
        return "Invalid", (
            f"Decimal part .{int(round(fraction * 100)):02d} of {number:g} is "
            f"not one of the permitted values "
            f"({', '.join(f'{a:.2f}' for a in allowed)}).")

    if family == "MIN_AGE":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        born, why = _parse_date_for_rule(value)
        if born is None:
            return "Invalid", f"Not a valid date: {why}"
        from datetime import date as _date
        today = _date.today()
        age = today.year - born.year - (
            (today.month, today.day) < (born.month, born.day))
        if age >= params["years"]:
            return "Valid", f"Age {age} meets the {params['years']}-year minimum."
        return "Invalid", (f"Age {age} is below the required minimum of "
                           f"{params['years']} years (born {born:%m/%d/%Y}).")

    if family == "DATE_BETWEEN":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        low_name, low_value = index.resolve(params["lower_field"], rule.field)
        high_name, high_value = index.resolve(params["upper_field"], rule.field)
        if low_name is None or high_name is None:
            missing = params["lower_field"] if low_name is None \
                else params["upper_field"]
            return "Not Automated", (
                f"Could not locate the referenced field {missing!r} "
                f"in this file.")
        if _is_blank_value(low_value) or _is_blank_value(high_value):
            return "N/A - condition not met", (
                f"{low_name!r} or {high_name!r} is blank, so the range "
                f"cannot be checked.")

        this_date, why = _parse_date_for_rule(value)
        if this_date is None:
            return "Invalid", f"Not a valid date: {why}"
        low_date, _a = _parse_date_for_rule(low_value)
        high_date, _b = _parse_date_for_rule(high_value)
        if low_date is None or high_date is None:
            return "Not Automated", (
                f"{low_name!r} or {high_name!r} is not a readable date.")

        from datetime import timedelta
        unit_days = {"day": 1, "week": 7, "month": 30, "year": 365}
        shift = params["upper_offset"] * unit_days[params["upper_unit"]]
        if params["upper_direction"] == "before":
            shift = -shift
        bound = high_date + timedelta(days=shift)

        if low_date <= this_date <= bound:
            return "Valid", (f"{this_date:%m/%d/%Y} falls between "
                             f"{low_name!r} ({low_date:%m/%d/%Y}) and "
                             f"{bound:%m/%d/%Y}.")
        return "Invalid", (f"{this_date:%m/%d/%Y} is outside the range "
                           f"{low_date:%m/%d/%Y} to {bound:%m/%d/%Y} "
                           f"({low_name!r} .. {high_name!r}).")

    if family == "DATE_AROUND":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        name, other_value = index.resolve(params["ref_field"], rule.field)
        if name is None:
            return "Not Automated", (
                f"Could not locate the referenced field "
                f"{params['ref_field']!r} in this file.")
        if _is_blank_value(other_value):
            return "N/A - condition not met", (
                f"{name!r} is blank, so the window cannot be measured.")
        this_date, why = _parse_date_for_rule(value)
        if this_date is None:
            return "Invalid", f"Not a valid date: {why}"
        base, _why = _parse_date_for_rule(other_value)
        if base is None:
            return "Not Automated", (
                f"{name!r} = {str(other_value)!r} is not a readable date.")
        unit_days = {"day": 1, "week": 7, "month": 30.44, "year": 365.25}
        limit = params["count"] * unit_days[params["unit"]]
        gap = abs((this_date - base).days)
        if gap <= limit + 0.5:
            return "Valid", (f"{this_date:%m/%d/%Y} is {gap} day(s) from "
                             f"{name!r} ({base:%m/%d/%Y}), within "
                             f"{params['count']} {params['unit']}(s).")
        return "Invalid", (f"{this_date:%m/%d/%Y} is {gap} day(s) from "
                           f"{name!r} ({base:%m/%d/%Y}), outside the "
                           f"{params['count']}-{params['unit']} window.")

    if family == "DATE_WITHIN":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        name, other_value = index.resolve(params["ref_field"], rule.field)
        if name is None:
            return "Not Automated", (
                f"Could not locate the referenced field "
                f"{params['ref_field']!r} in this file.")
        if _is_blank_value(other_value):
            return "N/A - condition not met", (
                f"{name!r} is blank, so the interval cannot be measured.")
        this_date, why = _parse_date_for_rule(value)
        if this_date is None:
            return "Invalid", f"Not a valid date: {why}"
        base, why_base = _parse_date_for_rule(other_value)
        if base is None:
            return "Not Automated", (
                f"{name!r} = {str(other_value)!r} is not a readable date.")

        days = (this_date - base).days
        if params["direction"] == "before":
            days = -days
        unit_days = {"day": 1, "week": 7, "month": 30.44, "year": 365.25}
        limit = params["count"] * unit_days[params["unit"]]
        if days < 0:
            return "Invalid", (
                f"{this_date:%m/%d/%Y} is before {name!r} "
                f"({base:%m/%d/%Y}); it must fall within "
                f"{params['count']} {params['unit']}(s) {params['direction']}.")
        if days <= limit + 0.5:
            return "Valid", (
                f"{this_date:%m/%d/%Y} is {days} day(s) {params['direction']} "
                f"{name!r} ({base:%m/%d/%Y}), within the "
                f"{params['count']}-{params['unit']} limit.")
        return "Invalid", (
            f"{this_date:%m/%d/%Y} is {days} day(s) {params['direction']} "
            f"{name!r} ({base:%m/%d/%Y}), exceeding the "
            f"{params['count']}-{params['unit']} limit.")

    if family == "DATE_OFFSET":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        name, other_value = index.resolve(params["ref_field"], rule.field)
        if name is None:
            return "Not Automated", (
                f"Could not locate the referenced field "
                f"{params['ref_field']!r} in this file.")
        if _is_blank_value(other_value):
            return "N/A - condition not met", (
                f"{name!r} is blank, so the offset cannot be calculated.")
        this_date, why_this = _parse_date_for_rule(value)
        if this_date is None:
            return "Invalid", f"Not a valid date: {why_this}"
        base, why_base = _parse_date_for_rule(other_value)
        if base is None:
            return "Not Automated", (
                f"{name!r} = {str(other_value)!r} is not a readable date.")

        months = params["count"] * (12 if params["unit"] == "year" else 1)
        month_index = base.year * 12 + (base.month - 1) + months
        year, month = divmod(month_index, 12)
        month += 1
        lengths = [31, 29 if (year % 4 == 0 and (year % 100 or year % 400 == 0))
                   else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        from datetime import date as _date
        try:
            expected = _date(year, month, min(base.day, lengths[month - 1]))
        except ValueError:
            return "Not Automated", "Offset date is out of range."
        if this_date == expected:
            return "Valid", (f"{this_date:%m/%d/%Y} is {params['count']} "
                             f"{params['unit']}(s) after {name!r} "
                             f"({base:%m/%d/%Y}).")
        return "Invalid", (
            f"Expected {expected:%m/%d/%Y} ({params['count']} "
            f"{params['unit']}(s) after {name!r} = {base:%m/%d/%Y}), "
            f"found {this_date:%m/%d/%Y}.")

    if family == "DATE_COMPARE":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        name, other_value = index.resolve(params["ref_field"], rule.field)
        if name is None:
            if isinstance(other_value, list):
                return "Not Automated", (
                    f"{params['ref_field']!r} is ambiguous in this file; "
                    f"candidates: {', '.join(other_value[:4])}.")
            return "Not Automated", (
                f"Could not locate the referenced field "
                f"{params['ref_field']!r} in this file.")
        if _is_blank_value(other_value):
            return "N/A - condition not met", (
                f"{name!r} is blank, so the dates cannot be compared.")

        this_date, why_this = _parse_date_for_rule(value)
        if this_date is None:
            return "Invalid", f"Not a valid date: {why_this}"
        other_date, why_other = _parse_date_for_rule(other_value)
        if other_date is None:
            return "Not Automated", (
                f"{name!r} = {str(other_value)!r} is not a readable date, so "
                f"the comparison cannot be made.")

        before = params["direction"] == "before"
        allow_equal = params.get("allow_equal", False)
        if before:
            ok = this_date <= other_date if allow_equal else this_date < other_date
        else:
            ok = this_date >= other_date if allow_equal else this_date > other_date

        wording = (("on or before" if allow_equal else "before") if before
                   else ("on or after" if allow_equal else "after"))
        if ok:
            return "Valid", (f"{this_date:%m/%d/%Y} is {wording} "
                             f"{name!r} ({other_date:%m/%d/%Y}).")
        return "Invalid", (f"{this_date:%m/%d/%Y} must be {wording} "
                           f"{name!r} ({other_date:%m/%d/%Y}).")

    if family == "MATCH_FIELD":
        name, other_value = index.resolve(params["ref_field"], rule.field)
        if name is None:
            return "Not Automated", (
                f"Could not locate the referenced field "
                f"{params['ref_field']!r} in this file.")
        if _is_blank_value(value) and _is_blank_value(other_value):
            return "N/A - blank value", f"Both this field and {name!r} are blank."
        if _norm(value) == _norm(other_value):
            return "Valid", f"Matches {name!r}."
        return "Invalid", (f"Value {str(value)!r} does not match {name!r} "
                           f"= {str(other_value)!r}.")

    if family == "OTHER_FIELD":
        subject = params["subject"]
        name, subject_value = index.resolve(subject, rule.field)
        if name is None:
            return "Not Automated", (
                f"Rule constrains {subject!r}, which is not present in this "
                f"file.")
        inner = Rule(field=name, source=rule.source, kind=rule.kind,
                     text=params["inner_text"])
        inner.family = params["inner_family"]
        inner.params = params["inner_params"]
        status, remark = _evaluate_rule(inner, subject_value, index)
        prefix = f"Rule applies to {name!r} (= {str(subject_value)!r}): "
        return status, (prefix + remark) if remark else prefix.rstrip(": ") + "."

    if family == "FORMAT":
        if _is_blank_value(value):
            return "N/A - blank value", "Format rule; field is empty."
        text = _display_text(value)
        problems = []

        # A long identifier stored as a number has already lost precision in
        # the workbook: float64 carries about 15 significant digits, so an
        # 18-digit value cannot round-trip. Report it rather than validate
        # digits that may already be wrong.
        if isinstance(value, float) and len(text.lstrip("-")) > 15:
            problems.append(
                f"is stored as a number with {len(text.lstrip('-'))} digits; "
                f"values this long lose precision in Excel and should be "
                f"stored as text")

        if params.get("alphanumeric") and not re.search(r"[A-Za-z0-9]", text):
            problems.append("contains no letters or digits")

        limit = params.get("max_length")
        if limit is not None and len(text) > limit:
            problems.append(f"is {len(text)} characters, exceeding the "
                            f"{limit}-character maximum")

        if params.get("no_special"):
            # Letters, digits and spaces are acceptable; other punctuation is
            # the "special character" the spec forbids.
            offenders = sorted({c for c in text
                                if not c.isalnum() and not c.isspace()})
            if offenders:
                problems.append("contains special character(s) "
                                + ", ".join(repr(c) for c in offenders))

        if params.get("only_digits") and not text.isdigit():
            problems.append("contains non-digit characters")

        case = params.get("case")
        if case == "lower" and text != text.lower():
            problems.append("is not entirely lowercase")
        elif case == "upper" and text != text.upper():
            problems.append("is not entirely uppercase")

        mask = params.get("mask")
        if mask:
            pattern = "".join(r"\d" if c in "0123456789xX*" else re.escape(c)
                              for c in mask)
            if not re.fullmatch(pattern, text):
                problems.append(f"does not match the required format {mask}")

        expected_digits = params.get("digit_count")
        if expected_digits is not None:
            found = len(re.sub(r"\D", "", text))
            if found != expected_digits:
                problems.append(f"has {found} digits, expected "
                                f"{expected_digits}")

        if problems:
            return "Invalid", f"Value {text!r} " + "; ".join(problems) + "."
        return "Valid", ""

    if family == "INFORMATIONAL":
        return "N/A - informational", f"Descriptive note, no testable rule: {rule.text}"

    if family in ("GREATER_THAN", "MIN_VALUE", "MAX_VALUE"):
        if _is_blank_value(value):
            return "N/A - blank value", ""
        number = _numeric_value(value)
        if number is None:
            return "Invalid", f"Value {str(value)!r} is not numeric."

        literal = params.get("literal")
        if family == "GREATER_THAN":
            threshold = params["minimum"]
            ok, wording = number > threshold, "greater than"
        elif family == "MIN_VALUE":
            threshold = params["threshold"]
            ok, wording = number >= threshold, "at least"
        else:
            threshold = params["threshold"]
            ok, wording = number <= threshold, "no greater than"

        if ok:
            return "Valid", ""
        shown = f"{threshold:,.0f}" if threshold == int(threshold) \
            else f"{threshold:,}"
        note = f" (spec writes {literal!r})" if literal and \
            _norm(literal) != _norm(shown) else ""
        return "Invalid", (f"Value {number:,g} must be {wording} "
                           f"{shown}{note}.")

    if family == "EXACT_DIGITS":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        digits = re.sub(r"\D", "", str(value))
        if len(digits) == params["count"]:
            return "Valid", ""
        return "Invalid", (f"Value {str(value)!r} contains {len(digits)} "
                           f"digits; exactly {params['count']} required.")

    if family == "NOT_FUTURE_DATE":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        parsed, why = _parse_date_for_rule(value)
        if parsed is None:
            return "Invalid", f"Not a valid date: {why}"
        from datetime import date as _date
        if parsed > _date.today():
            return "Invalid", f"{parsed:%m/%d/%Y} is a future date."
        return "Valid", ""

    if family == "MIN_YEAR":
        if _is_blank_value(value):
            return "N/A - blank value", ""
        parsed, why = _parse_date_for_rule(value)
        if parsed is None:
            return "Invalid", f"Not a valid date: {why}"
        if parsed.year < params["year"]:
            return "Invalid", (f"Year {parsed.year} is earlier than "
                               f"{params['year']}.")
        return "Valid", ""

    if family == "MUTEX":
        name, trigger_value = index.checkbox_group(rule.field,
                                                   params["trigger_option"])
        if name is None:
            if isinstance(trigger_value, list):
                return "Not Automated", (
                    f"{params['trigger_option']!r} is ambiguous in this file; "
                    f"candidates: {', '.join(trigger_value[:4])}.")
            return "Not Automated", (
                f"Could not locate the referenced field "
                f"{params['trigger_option']!r} in this file.")
        if not _is_true(trigger_value):
            return "N/A - condition not met", (
                f"{name!r} is not selected, so the rule does not apply.")

        # Which listed option, if any, does THIS row represent? The rule is
        # attached both to each option and to the trigger/roll-up field, and
        # the trigger is not one of the forbidden options -- checking its own
        # value flagged the trigger against itself.
        owner = _clean(rule.field)
        owner_option = owner.rsplit(" - ", 1)[1] if " - " in owner else ""
        is_forbidden_option = bool(owner_option) and any(
            _norm(owner_option) == _norm(f) for f in params["forbidden"])

        if is_forbidden_option:
            if _is_true(value):
                return "Invalid", (
                    f"{name!r} is selected, so this option must not also be "
                    f"selected.")
            return "Valid", f"{name!r} is selected and this option is not."

        # This row is the trigger itself or the roll-up field. The meaningful
        # check is across the group: is any forbidden option selected?
        selected = []
        for option in params["forbidden"]:
            option_name, option_value = index.checkbox_group(rule.field, option)
            if option_name is None or _norm(option_name) == _norm(name):
                continue
            if _is_true(option_value):
                selected.append(option_name)

        if selected:
            return "Invalid", (
                f"{name!r} is selected, so no race/ethnicity option may be "
                f"selected, but {len(selected)} is/are: "
                + ", ".join(repr(x) for x in selected[:4])
                + ("..." if len(selected) > 4 else "") + ".")
        return "Valid", (f"{name!r} is selected and none of the "
                         f"{len(params['forbidden'])} listed options are.")

    # --- conditional families ---------------------------------------------
    name, ref_value = index.resolve(params["ref_field"], rule.field)
    if name is None:
        if isinstance(ref_value, list):
            return "Not Automated", (
                f"{params['ref_field']!r} is ambiguous in this file; "
                f"candidates: {', '.join(ref_value[:4])}.")
        return "Not Automated", (
            f"Could not locate the referenced field "
            f"{params['ref_field']!r} in this file.")

    ref_values = params.get("ref_values") or []
    # Every condition in the antecedent must hold. The referenced values are
    # read from this same loan file, so a rule guarded by three fields is only
    # applied when all three match.
    checks = [{
        "ref_field": params["ref_field"],
        "ref_values": ref_values,
        "starts_with": params.get("starts_with", False),
        "negate": params.get("negate", False),
    }] + list(params.get("extra_conditions") or [])

    resolved, unmet = [], None
    for spec in checks:
        if spec is checks[0]:
            check_name, check_value = name, ref_value
        else:
            check_name, check_value = index.resolve(spec["ref_field"],
                                                    rule.field)
            if check_name is None:
                return "Not Automated", (
                    f"Could not locate the referenced field "
                    f"{spec['ref_field']!r} in this file.")
        held, how = _condition_holds(spec, check_value)
        resolved.append((check_name, check_value, how, held))
        if not held and unmet is None:
            unmet = (check_name, check_value, how)

    if unmet is not None:
        others = " ; ".join(f"{n!r} = {str(v)!r}" for n, v, _, _ in resolved
                            if n != unmet[0])
        detail = f" (other conditions: {others})" if others else ""
        return "N/A - condition not met", (
            f"{unmet[0]!r} = {str(unmet[1])!r}; rule applies only when it "
            f"{unmet[2]}{detail}.")

    context = ("All conditions met ["
               + " ; ".join(f"{n!r} = {str(v)!r}" for n, v, _, _ in resolved)
               + "]: ") if len(resolved) > 1 else \
        f"{name!r} = {str(ref_value)!r}: "

    if family == "COND_NOT_BLANK":
        if _is_blank_value(value):
            return "Invalid", context + "this field must not be blank."
        return "Valid", ""

    if family == "COND_MUST_BE_BLANK":
        if not _is_blank_value(value):
            return "Invalid", (context + f"this field should be blank but "
                                         f"holds {str(value)!r}.")
        return "Valid", ""

    if family == "COND_FORMAT":
        if _is_blank_value(value):
            if params.get("require_value"):
                return "Invalid", context + "this field must not be blank."
            return "N/A - blank value", ""
        inner = Rule(field=rule.field, source=rule.source, kind=rule.kind,
                     text=rule.text)
        inner.family = "FORMAT"
        inner.params = params["format"]
        status, remark = _evaluate_rule(inner, value, index)
        return status, (context + remark) if remark else ""

    if family == "COND_OTHER_FIELD":
        subject = params["subject"]
        name, subject_value = index.resolve(subject, rule.field)
        if name is None:
            return "Not Automated", (
                f"Rule constrains {subject!r}, which is not present in this "
                f"file.")
        inner = Rule(field=name, source=rule.source, kind=rule.kind,
                     text=params["inner_text"])
        inner.family = params["inner_family"]
        inner.params = params["inner_params"]
        status, remark = _evaluate_rule(inner, subject_value, index)
        prefix = context + f"rule applies to {name!r} "
        prefix += f"(= {str(subject_value)!r}): "
        return status, (prefix + remark) if remark else prefix.rstrip(": ") + "."

    if family == "COND_ALLOWED_SET":
        allowed = params["allowed"]
        if _is_blank_value(value):
            return "Invalid", (context + f"expected one of "
                               f"{' / '.join(allowed)}, found blank.")
        if _match_any(value, allowed):
            return "Valid", ""
        return "Invalid", (context + f"value {str(value)!r} is not one of "
                           f"{' / '.join(allowed)}.")

    if family == "COND_EQUALS":
        expected = params["expected"]
        if _match_any(value, expected):
            return "Valid", ""
        return "Invalid", (context + f"expected "
                           f"{' or '.join(repr(e) for e in expected)}, "
                           f"found {str(value)!r}.")

    if family == "COND_NOT_EQUALS":
        forbidden = params["forbidden"]
        if _match_any(value, forbidden):
            return "Invalid", (context + f"value must not be "
                               f"{' or '.join(repr(f) for f in forbidden)}.")
        return "Valid", ""

    return "Not Automated", f"Unhandled rule family {family}."


def _parse_date_for_rule(value):
    """Local date parse so this module does not depend on the macro layer."""
    from datetime import date, datetime, timedelta

    if isinstance(value, datetime):
        return value.date(), ""
    if isinstance(value, date):
        return value, ""

    text = str(value).strip()
    formats = ["%m-%d-%Y", "%m/%d/%Y", "%Y-%m-%d", "%Y/%m/%d", "%Y%m%d",
               "%m-%d-%y", "%m/%d/%y", "%d-%b-%Y", "%b %d, %Y"]
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt).date(), ""
        except ValueError:
            continue
    try:
        serial = float(text) if not isinstance(value, (int, float)) else float(value)
    except (TypeError, ValueError):
        return None, f"{text!r} is not a recognised date format."
    if not 1 <= serial <= 2958465:
        return None, f"{text!r} is not a plausible date."
    return (datetime(1899, 12, 30) + timedelta(days=serial)).date(), ""


def evaluate_conditions(field_names, values, rules):
    """Return one (status, kind, remark) triple per sample row."""
    index = FieldIndex(field_names, values)
    output = []

    for name, value in zip(field_names, values):
        key = _norm(name)
        applicable = rules.get(key)
        if not applicable:
            output.append(("N/A - no condition rule", "", ""))
            continue

        statuses, remarks = [], []
        kinds = {r.kind for r in applicable if r.kind}
        for rule in applicable:
            status, remark = _evaluate_rule(rule, value, index)
            statuses.append(status)
            if remark:
                remarks.append(f"[{status}] {remark}")

        # Worst-case wins: Invalid > Not Automated > Valid > N/A.
        if "Invalid" in statuses:
            final = "Invalid"
        elif "Not Automated" in statuses:
            final = "Not Automated" if "Valid" not in statuses \
                else "Valid - partial"
        elif "Valid" in statuses:
            final = "Valid"
        else:
            final = statuses[0]

        output.append((final, "/".join(sorted(kinds)),
                       " | ".join(remarks)))
    return output
