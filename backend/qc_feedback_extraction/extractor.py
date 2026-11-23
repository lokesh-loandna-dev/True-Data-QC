"""
Email Extractor & QC Feedback Body Parser Module.
Fetches emails via IMAP or Windows Outlook Desktop COM,
cleans HTML/plain text email bodies, and extracts structured QC feedback fields.
"""

import re
import html
import imaplib
import email
from email.header import decode_header
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from html.parser import HTMLParser

try:
    from bs4 import BeautifulSoup
    HAS_BEAUTIFUL_SOUP = True
except ImportError:
    HAS_BEAUTIFUL_SOUP = False


class SimpleHTMLTextExtractor(HTMLParser):
    """Fallback HTML text extractor preserving line breaks and table structures."""
    def __init__(self):
        super().__init__()
        self.result = []

    def handle_starttag(self, tag, attrs):
        tag_lower = tag.lower()
        if tag_lower in ("p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4"):
            self.result.append("\n")
        elif tag_lower in ("td", "th"):
            self.result.append(" | ")

    def handle_endtag(self, tag):
        tag_lower = tag.lower()
        if tag_lower in ("p", "div", "tr", "li"):
            self.result.append("\n")

    def handle_data(self, data):
        cleaned = data.strip()
        if cleaned:
            self.result.append(data)

    def get_text(self) -> str:
        raw = "".join(self.result)
        return re.sub(r"\n\s*\n\s*\n+", "\n\n", raw).strip()


def clean_html_to_text(html_content: str) -> str:
    """Converts HTML email body into clean, structured plain text."""
    if not html_content:
        return ""

    if HAS_BEAUTIFUL_SOUP:
        try:
            soup = BeautifulSoup(html_content, "html.parser")
            for elem in soup(["script", "style", "head", "title", "meta"]):
                elem.decompose()
            for br in soup.find_all("br"):
                br.replace_with("\n")
            for tr in soup.find_all("tr"):
                tr.insert_after("\n")
            for td in soup.find_all(["td", "th"]):
                td.insert_after(" | ")
            return soup.get_text(separator=" ", strip=True)
        except Exception:
            pass

    try:
        parser = SimpleHTMLTextExtractor()
        parser.feed(html_content)
        return parser.get_text()
    except Exception:
        no_tags = re.sub(r"<[^>]+>", " ", html_content)
        return html.unescape(no_tags).strip()


def parse_html_tables(html_content: str) -> List[List[str]]:
    """Extracts rows and columns from HTML tables in email body."""
    rows = []
    if not html_content:
        return rows

    if HAS_BEAUTIFUL_SOUP:
        try:
            soup = BeautifulSoup(html_content, "html.parser")
            for table in soup.find_all("table"):
                for tr in table.find_all("tr"):
                    cells = [re.sub(r"\s+", " ", c.get_text(strip=True)) for c in tr.find_all(["td", "th"])]
                    if any(cells):
                        rows.append(cells)
            return rows
        except Exception:
            pass

    table_matches = re.findall(r"<tr[^>]*>(.*?)</tr>", html_content, re.IGNORECASE | re.DOTALL)
    for row_html in table_matches:
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_html, re.IGNORECASE | re.DOTALL)
        clean_cells = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
        if any(clean_cells):
            rows.append(clean_cells)
    return rows


def decode_mime_header(header_value: Optional[str]) -> str:
    """Decodes MIME encoded header strings."""
    if not header_value:
        return ""
    fragments = []
    for fragment, encoding in decode_header(header_value):
        if isinstance(fragment, bytes):
            try:
                fragments.append(fragment.decode(encoding or "utf-8", errors="replace"))
            except Exception:
                fragments.append(fragment.decode("latin-1", errors="replace"))
        else:
            fragments.append(str(fragment))
    return " ".join(fragments).strip()


class EmailMessageData:
    """Container holding email metadata and extracted QC feedback fields."""
    def __init__(self, message_id: str, subject: str, sender: str, recipients: str, date: datetime, raw_body: str, html_body: str = ""):
        self.message_id = message_id
        self.subject = subject
        self.sender = sender
        self.recipients = recipients
        self.date = date
        self.raw_body = raw_body
        self.html_body = html_body
        self.cleaned_body = clean_html_to_text(html_body) if html_body else raw_body.strip()

        # Parsed QC Fields
        self.loan_id = ""
        self.borrower_name = ""
        self.qc_analyst = ""
        self.audit_type = "Standard QC"
        self.qc_status = "Pending Review"
        self.defect_category = ""
        self.expected_value = ""
        self.actual_value = ""
        self.observations = ""
        self.action_required = ""
        self.detailed_items: List[Dict[str, Any]] = []

        self._parse_qc_fields()

    def _parse_qc_fields(self):
        combined = f"{self.subject}\n{self.cleaned_body}"

        # 1. Loan ID
        loan_match = re.search(r"(?:Loan\s*(?:ID|#|Number|No\.?)|Package\s*(?:ID|#)|File\s*#)\s*[:\-]\s*([A-Za-z0-9\-_]{5,20})", combined, re.IGNORECASE)
        if loan_match:
            self.loan_id = loan_match.group(1).strip()
        else:
            sub_match = re.search(r"\b(\d{6,12})\b", self.subject)
            if sub_match:
                self.loan_id = sub_match.group(1)

        # 2. Borrower Name
        borrower_match = re.search(r"(?:Borrower\s*Name|Customer\s*Name|Borrower|Customer)\s*[:\-]\s*([^\n\r,;|]+)", self.cleaned_body, re.IGNORECASE)
        if borrower_match:
            self.borrower_name = borrower_match.group(1).strip()

        # 3. QC Analyst / Reviewer
        analyst_match = re.search(r"(?:QC\s*Analyst|Reviewer|Auditor|Audited\s*By|Reviewed\s*By)\s*[:\-]\s*([^\n\r,;|]+)", self.cleaned_body, re.IGNORECASE)
        if analyst_match:
            self.qc_analyst = analyst_match.group(1).strip()
        else:
            self.qc_analyst = self.sender.split("<")[0].replace('"', "").strip()

        # 4. Audit / Review Type
        audit_match = re.search(r"(?:Audit\s*Type|Review\s*Type|QC\s*Type|Stage)\s*[:\-]\s*([^\n\r,;|]+)", self.cleaned_body, re.IGNORECASE)
        if audit_match:
            self.audit_type = audit_match.group(1).strip()
        elif "pre-uw" in combined.lower() or "pre uw" in combined.lower():
            self.audit_type = "Pre-UW QC"
        elif "junior uw" in combined.lower() or "junior-uw" in combined.lower():
            self.audit_type = "Junior UW QC"
        elif "post-close" in combined.lower() or "post close" in combined.lower():
            self.audit_type = "Post-Closing QC"

        # 5. QC Status
        status_match = re.search(r"(?:QC\s*Status|Overall\s*Status|Audit\s*Status|Result|Outcome)\s*[:\-]\s*([^\n\r,;|]+)", self.cleaned_body, re.IGNORECASE)
        if status_match:
            self.qc_status = status_match.group(1).strip()
        elif re.search(r"\b(failed|fail|defect|discrepancy|rejected)\b", combined, re.IGNORECASE):
            self.qc_status = "Failed / Discrepancy Found"
        elif re.search(r"\b(passed|pass|approved|verified|cleared)\b", combined, re.IGNORECASE):
            self.qc_status = "Passed / Approved"
        elif re.search(r"\b(pending|action\s*required|correction\s*needed)\b", combined, re.IGNORECASE):
            self.qc_status = "Action Required"

        # 6. Defect Category
        defect_match = re.search(r"(?:Defect\s*Category|Deficiency|Error\s*Type|Category)\s*[:\-]\s*([^\n\r,;|]+)", self.cleaned_body, re.IGNORECASE)
        if defect_match:
            self.defect_category = defect_match.group(1).strip()

        # 7. Action Required
        action_match = re.search(r"(?:Action\s*(?:Required|Needed)|Next\s*Steps|Resolution)\s*[:\-]\s*([^\n\r]+)", self.cleaned_body, re.IGNORECASE)
        if action_match:
            self.action_required = action_match.group(1).strip()

        # 8. Observations
        remarks_match = re.search(r"(?:Feedback|Remarks|Comments|Observations|Notes)\s*[:\-]\s*([^\n\r]+(?:\n[^\n\r]+){0,4})", self.cleaned_body, re.IGNORECASE)
        if remarks_match:
            self.observations = remarks_match.group(1).strip()
        else:
            lines = [l.strip() for l in self.cleaned_body.splitlines() if l.strip() and not l.startswith(">")]
            self.observations = " | ".join(lines[:3]) if lines else "No specific observations"

        # 9. Extract detailed findings / bullet items / table rows
        self._extract_detailed_items()

    def _extract_detailed_items(self):
        if self.html_body:
            tables = parse_html_tables(self.html_body)
            if len(tables) > 1:
                for idx, row in enumerate(tables[1:], start=1):
                    self.detailed_items.append({
                        "item_num": idx,
                        "loan_id": self.loan_id,
                        "field_name": row[0] if len(row) > 0 else "",
                        "expected_value": row[1] if len(row) > 1 else "",
                        "actual_value": row[2] if len(row) > 2 else "",
                        "remarks": row[3] if len(row) > 3 else (row[1] if len(row) == 2 else ""),
                        "status": self.qc_status
                    })
                if self.detailed_items:
                    return

        # Bullet point / numbered lists
        patterns = re.findall(r"(?:^|\n)\s*(?:[0-9]+[\.\)]|[\*\-\•])\s*([^\n\r]+)", self.cleaned_body)
        for idx, line in enumerate(patterns, start=1):
            clean_l = line.strip()
            if len(clean_l) > 5 and not clean_l.lower().startswith("best regards"):
                self.detailed_items.append({
                    "item_num": idx,
                    "loan_id": self.loan_id,
                    "field_name": clean_l.split(":")[0] if ":" in clean_l else f"Finding #{idx}",
                    "expected_value": "",
                    "actual_value": "",
                    "remarks": clean_l,
                    "status": self.qc_status
                })


class MailboxExtractor:
    """Connects to mailbox via IMAP or Outlook Desktop COM and extracts QC feedback emails."""
    def __init__(self, username: str, password: str, server: str = "outlook.office365.com", port: int = 993):
        self.username = username
        self.password = password
        self.server = server
        self.port = port
        self.imap_conn: Optional[imaplib.IMAP4_SSL] = None

    def connect_imap(self) -> bool:
        try:
            print(f"[Extractor] Connecting to IMAP server {self.server}:{self.port}...")
            self.imap_conn = imaplib.IMAP4_SSL(self.server, self.port)
            self.imap_conn.login(self.username, self.password)
            print(f"[Extractor] Authentication successful for {self.username}")
            return True
        except Exception as e:
            print(f"[Extractor] IMAP authentication notice for {self.username}: {str(e)}")
            return False

    def fetch_emails_imap(
        self,
        folder: str = "INBOX",
        days_back: Optional[int] = 7,
        subject_keywords: Optional[List[str]] = None,
        max_emails: int = 50,
        mark_as_read: bool = False
    ) -> List[EmailMessageData]:
        if not self.imap_conn:
            if not self.connect_imap():
                return []

        messages: List[EmailMessageData] = []
        try:
            status, _ = self.imap_conn.select(f'"{folder}"')
            if status != "OK":
                self.imap_conn.select("INBOX")

            search_criteria = []
            if days_back is not None and days_back > 0:
                since_date = (datetime.now() - timedelta(days=days_back)).strftime("%d-%b-%Y")
                search_criteria.append(f'(SINCE "{since_date}")')
            else:
                search_criteria.append("ALL")

            query = " ".join(search_criteria)
            status, data = self.imap_conn.search(None, query)
            if status != "OK" or not data or not data[0]:
                return []

            email_ids = data[0].split()
            for e_id in reversed(email_ids[-max_emails:]):
                try:
                    res, msg_data = self.imap_conn.fetch(e_id, "(RFC822)")
                    if res != "OK":
                        continue
                    parsed_email = email.message_from_bytes(msg_data[0][1])

                    subject = decode_mime_header(parsed_email.get("Subject", "No Subject"))
                    sender = decode_mime_header(parsed_email.get("From", "Unknown Sender"))
                    recipients = decode_mime_header(parsed_email.get("To", ""))
                    msg_id = parsed_email.get("Message-ID", str(e_id))

                    raw_date = parsed_email.get("Date")
                    try:
                        date_obj = email.utils.parsedate_to_datetime(raw_date)
                    except Exception:
                        date_obj = datetime.now()

                    if subject_keywords:
                        if not any(k.lower() in subject.lower() for k in subject_keywords):
                            continue

                    body_plain = ""
                    body_html = ""
                    if parsed_email.is_multipart():
                        for part in parsed_email.walk():
                            ctype = part.get_content_type()
                            disp = str(part.get("Content-Disposition", ""))
                            if "attachment" in disp:
                                continue
                            payload = part.get_payload(decode=True)
                            if not payload:
                                continue
                            charset = part.get_content_charset() or "utf-8"
                            try:
                                text_content = payload.decode(charset, errors="replace")
                            except Exception:
                                text_content = payload.decode("latin-1", errors="replace")

                            if ctype == "text/plain":
                                body_plain += text_content + "\n"
                            elif ctype == "text/html":
                                body_html += text_content + "\n"
                    else:
                        payload = parsed_email.get_payload(decode=True)
                        charset = parsed_email.get_content_charset() or "utf-8"
                        try:
                            text_content = payload.decode(charset, errors="replace") if payload else ""
                        except Exception:
                            text_content = payload.decode("latin-1", errors="replace") if payload else ""
                        if parsed_email.get_content_type() == "text/html":
                            body_html = text_content
                        else:
                            body_plain = text_content

                    msg_item = EmailMessageData(
                        message_id=msg_id,
                        subject=subject,
                        sender=sender,
                        recipients=recipients,
                        date=date_obj,
                        raw_body=body_plain,
                        html_body=body_html
                    )
                    messages.append(msg_item)
                    if mark_as_read:
                        self.imap_conn.store(e_id, "+FLAGS", "\\Seen")
                except Exception as ex:
                    continue
        except Exception as e:
            print(f"[Extractor] IMAP fetch notice: {str(e)}")
        finally:
            self.close()

        return messages

    def fetch_emails_outlook_desktop(
        self,
        folder_name: str = "Inbox",
        days_back: Optional[int] = 7,
        subject_keywords: Optional[List[str]] = None,
        max_emails: int = 50
    ) -> List[EmailMessageData]:
        messages: List[EmailMessageData] = []
        try:
            import win32com.client
            print("[Extractor] Connecting to local Microsoft Outlook desktop client via COM...")
            outlook = win32com.client.Dispatch("Outlook.Application").GetNamespace("MAPI")
            inbox = outlook.GetDefaultFolder(6)  # 6 = olFolderInbox

            if folder_name and folder_name.lower() != "inbox":
                try:
                    inbox = inbox.Folders[folder_name]
                except Exception:
                    pass

            items = inbox.Items
            items.Sort("[ReceivedTime]", True)

            count = 0
            for item in items:
                if count >= max_emails:
                    break
                try:
                    subject = getattr(item, "Subject", "")
                    sender = getattr(item, "SenderName", "") + f" <{getattr(item, 'SenderEmailAddress', '')}>"
                    received_time = getattr(item, "ReceivedTime", None)
                    body_text = getattr(item, "Body", "")
                    body_html = getattr(item, "HTMLBody", "")
                    entry_id = getattr(item, "EntryID", str(count))

                    if days_back and received_time:
                        cutoff = datetime.now() - timedelta(days=days_back)
                        dt_no_tz = received_time.replace(tzinfo=None) if hasattr(received_time, "replace") else received_time
                        if dt_no_tz < cutoff:
                            continue

                    if subject_keywords:
                        if not any(k.lower() in subject.lower() for k in subject_keywords):
                            continue

                    msg_data = EmailMessageData(
                        message_id=entry_id,
                        subject=subject,
                        sender=sender,
                        recipients="",
                        date=received_time or datetime.now(),
                        raw_body=body_text,
                        html_body=body_html
                    )
                    messages.append(msg_data)
                    count += 1
                except Exception:
                    continue
        except Exception as e:
            print(f"[Extractor] Outlook COM connection notice: {str(e)}")

        return messages

    def close(self):
        if self.imap_conn:
            try:
                self.imap_conn.close()
                self.imap_conn.logout()
            except Exception:
                pass
            self.imap_conn = None
