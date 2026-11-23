"""
Email Extractor & QC Feedback Body Parser Module.
Extracts emails from a local folder (.eml, .msg, .txt, .html) or IMAP mailbox,
and intelligently parses multiple QC feedback items per loan number.
"""

import os
import re
import html
import imaplib
import email
from email.header import decode_header
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional
from html.parser import HTMLParser

try:
    from bs4 import BeautifulSoup
    HAS_BEAUTIFUL_SOUP = True
except ImportError:
    HAS_BEAUTIFUL_SOUP = False


class SimpleHTMLTextExtractor(HTMLParser):
    """Fallback HTML text extractor preserving line breaks and list items."""
    def __init__(self):
        super().__init__()
        self.result = []

    def handle_starttag(self, tag, attrs):
        tag_lower = tag.lower()
        if tag_lower in ("p", "div", "br", "tr", "h1", "h2", "h3", "h4"):
            self.result.append("\n")
        elif tag_lower == "li":
            self.result.append("\n- ")
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
    """Converts HTML email body into clean, structured plain text with preserved line breaks."""
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
            for li in soup.find_all("li"):
                li.insert_before("\n- ")
            for p in soup.find_all(["p", "div"]):
                p.insert_after("\n")
            for td in soup.find_all(["td", "th"]):
                td.insert_after(" | ")
            return soup.get_text(separator="\n", strip=True)
        except Exception:
            pass

    try:
        parser = SimpleHTMLTextExtractor()
        parser.feed(html_content)
        return parser.get_text()
    except Exception:
        no_tags = re.sub(r"<[^>]+>", " ", html_content)
        return html.unescape(no_tags).strip()


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
    """Container holding email metadata and extracted QC feedback items."""
    def __init__(self, message_id: str, subject: str, sender: str, recipients: str, date: datetime, raw_body: str, html_body: str = "", source_file: str = ""):
        self.message_id = message_id
        self.subject = subject
        self.sender = sender
        self.recipients = recipients
        self.date = date
        self.raw_body = raw_body
        self.html_body = html_body
        self.source_file = source_file
        self.cleaned_body = clean_html_to_text(html_body) if html_body else raw_body.strip()

        # Parsed QC Fields
        self.loan_id = ""
        self.feedback_items: List[str] = []

        self._parse_qc_fields()

    def _parse_qc_fields(self):
        combined = f"{self.subject}\n{self.cleaned_body}"

        # 1. Parse Date Received from body if explicitly written (e.g., "Date Received: 10/7/2026" or "Date: 10/7/2026")
        date_match = re.search(r"(?:Date\s*Received|Date)\s*[:\-]\s*(\d{1,2}/\d{1,2}/\d{2,4})", combined, re.IGNORECASE)
        if date_match:
            try:
                parsed_dt = datetime.strptime(date_match.group(1).strip(), "%m/%d/%Y")
                self.date = parsed_dt
            except Exception:
                try:
                    parsed_dt = datetime.strptime(date_match.group(1).strip(), "%m/%d/%y")
                    self.date = parsed_dt
                except Exception:
                    pass

        # 2. Extract Loan Number
        loan_match = re.search(r"(?:Loan\s*(?:Number|ID|#|No\.?)|Package\s*(?:ID|#)|File\s*#)\s*[:\-]?\s*([0-9]{7,15})", combined, re.IGNORECASE)
        if loan_match:
            self.loan_id = loan_match.group(1).strip()
        else:
            sub_num = re.search(r"\b([0-9]{7,15})\b", self.subject)
            if sub_num:
                self.loan_id = sub_num.group(1).strip()
            else:
                body_num = re.search(r"\b([0-9]{7,15})\b", self.cleaned_body)
                if body_num:
                    self.loan_id = body_num.group(1).strip()

        # 3. Extract All QC Feedback Items
        self.feedback_items = self._extract_multiple_feedback_items()

    def _extract_multiple_feedback_items(self) -> List[str]:
        """
        Parses multiple distinct feedback items from the email body.
        Handles sequential numbered lists (1. ... 2. ... 3. ...),
        HTML <li> tags, bullet points, and 'No Feedback'.
        """
        body = self.cleaned_body.strip()

        # Check for explicit "No Feedback" signals
        if re.search(r"\bno\s+feedback\b", body, re.IGNORECASE) and not re.search(r"(?:^|[\r\n]+|\s+)[1-9][\.\)]\s+\S+", body):
            return ["No Feedback"]

        # Strategy A: Check HTML list tags if HTML is available
        if self.html_body and HAS_BEAUTIFUL_SOUP:
            try:
                soup = BeautifulSoup(self.html_body, "html.parser")
                li_tags = soup.find_all("li")
                if len(li_tags) >= 2:
                    html_items = []
                    for idx, li in enumerate(li_tags, start=1):
                        txt = re.sub(r"\s+", " ", li.get_text(strip=True))
                        if txt:
                            if not re.match(r"^\d+[\.\)]", txt):
                                txt = f"{idx}. {txt}"
                            html_items.append(txt)
                    if html_items:
                        return html_items
            except Exception:
                pass

        # Strategy B: Sequential Numbered Items (1., 2., 3., 4., ...)
        # Handles both multi-line and single-line running text without breaking on numbers inside sentences (e.g. "corrected to 12.")
        start_match = re.search(r"(?:^|[\r\n]+|\s+)1[\.\)]\s+", body)
        if start_match:
            items = []
            pos = start_match.end()
            current_num = 1

            while True:
                next_num = current_num + 1
                next_pat = re.compile(rf"(?:[\r\n]+\s*|\s+){next_num}[\.\)]\s+")
                match = next_pat.search(body, pos)
                if match:
                    item_text = body[pos:match.start()].strip()
                    item_text = re.sub(r"\s+", " ", item_text)
                    items.append(f"{current_num}. {item_text}")
                    pos = match.end()
                    current_num = next_num
                else:
                    # Final item: read till end of feedback or signature
                    tail = body[pos:].strip()
                    tail = re.split(r"[\r\n]+\s*(?:Best regards|Thanks|Sincerely|Regards|From:)", tail, flags=re.IGNORECASE)[0].strip()
                    tail = re.sub(r"\s+", " ", tail)
                    if tail:
                        items.append(f"{current_num}. {tail}")
                    break

            if items:
                return items

        # Strategy C: Bullet Points (- ... or * ... or • ...)
        bullet_matches = re.findall(r"(?:^|[\r\n]+)\s*[\*\-\•]\s*([^\r\n]+(?:[\r\n]+(?!\s*[\*\-\•]|\s*[A-Z][a-z]+:)[^\r\n]+)*)", body)
        if bullet_matches:
            items = []
            for idx, b in enumerate(bullet_matches, start=1):
                clean_b = re.sub(r"\s+", " ", b).strip()
                clean_b = re.split(r"[\r\n]+\s*(?:Best regards|Thanks|Sincerely)", clean_b, flags=re.IGNORECASE)[0].strip()
                if clean_b:
                    items.append(f"{idx}. {clean_b}")
            if items:
                return items

        # Strategy D: Check for "QC Feedback:" or "Observations:" paragraph block
        fb_block = re.search(r"(?:QC\s*Feedback|Feedback|Observations|Notes|Findings)\s*[:\-]\s*([\s\S]+)", body, re.IGNORECASE)
        if fb_block:
            block_lines = [l.strip() for l in fb_block.group(1).splitlines() if l.strip() and not l.lower().startswith(("best regards", "thanks"))]
            if len(block_lines) > 1:
                return [f"{idx}. {re.sub(r'^\d+[\.\)]\s*', '', l)}" for idx, l in enumerate(block_lines, start=1)]
            elif len(block_lines) == 1:
                return [block_lines[0]]

        # Strategy E: Fallback
        meaningful = [
            l.strip() for l in body.splitlines()
            if l.strip() and not l.lower().startswith(("loan", "date", "borrower", "subject", "from", "to", "hello", "hi", "best regards", "thanks"))
        ]
        if meaningful:
            return [f"{idx}. {l}" for idx, l in enumerate(meaningful[:5], start=1)]

        return ["No Feedback"]


class LocalEmailFolderExtractor:
    """Extracts email files from a local directory."""
    SUPPORTED_EXTENSIONS = {".eml", ".msg", ".txt", ".text", ".html", ".htm"}

    def __init__(self, folder_path: Path):
        self.folder_path = Path(folder_path)

    def extract_all(self) -> List[EmailMessageData]:
        if not self.folder_path.exists() or not self.folder_path.is_dir():
            print(f"[LocalExtractor] ERROR: Folder does not exist: {self.folder_path}")
            return []

        files = [
            f for f in self.folder_path.iterdir()
            if f.is_file() and f.suffix.lower() in self.SUPPORTED_EXTENSIONS
        ]

        if not files:
            print(f"[LocalExtractor] No supported email files found in {self.folder_path}")
            return []

        print(f"[LocalExtractor] Found {len(files)} email file(s) in {self.folder_path}")
        results: List[EmailMessageData] = []

        for f in sorted(files, key=lambda x: x.name):
            try:
                ext = f.suffix.lower()
                if ext == ".eml":
                    item = self._parse_eml_file(f)
                elif ext == ".msg":
                    item = self._parse_msg_file(f)
                elif ext in (".txt", ".text"):
                    item = self._parse_txt_file(f)
                elif ext in (".html", ".htm"):
                    item = self._parse_html_file(f)
                else:
                    continue

                if item:
                    results.append(item)
                    print(f"  ✓ Processed: {f.name} (Loan: {item.loan_id or 'N/A'}, Feedback Items: {len(item.feedback_items)})")
            except Exception as e:
                print(f"  ✗ Error reading {f.name}: {e}")

        return results

    def _parse_eml_file(self, file_path: Path) -> Optional[EmailMessageData]:
        with open(file_path, "rb") as fp:
            msg = email.message_from_bytes(fp.read())

        subject = decode_mime_header(msg.get("Subject", file_path.stem))
        sender = decode_mime_header(msg.get("From", "Unknown Sender"))
        recipients = decode_mime_header(msg.get("To", ""))
        msg_id = msg.get("Message-ID", file_path.name)

        raw_date = msg.get("Date")
        try:
            date_obj = email.utils.parsedate_to_datetime(raw_date)
        except Exception:
            date_obj = datetime.fromtimestamp(file_path.stat().st_mtime)

        body_plain = ""
        body_html = ""

        if msg.is_multipart():
            for part in msg.walk():
                ctype = part.get_content_type()
                disp = str(part.get("Content-Disposition", ""))
                if "attachment" in disp:
                    continue
                payload = part.get_payload(decode=True)
                if not payload:
                    continue
                charset = part.get_content_charset() or "utf-8"
                try:
                    text_str = payload.decode(charset, errors="replace")
                except Exception:
                    text_str = payload.decode("latin-1", errors="replace")

                if ctype == "text/plain":
                    body_plain += text_str + "\n"
                elif ctype == "text/html":
                    body_html += text_str + "\n"
        else:
            payload = msg.get_payload(decode=True)
            charset = msg.get_content_charset() or "utf-8"
            try:
                text_str = payload.decode(charset, errors="replace") if payload else ""
            except Exception:
                text_str = payload.decode("latin-1", errors="replace") if payload else ""

            if msg.get_content_type() == "text/html":
                body_html = text_str
            else:
                body_plain = text_str

        return EmailMessageData(
            message_id=msg_id,
            subject=subject,
            sender=sender,
            recipients=recipients,
            date=date_obj,
            raw_body=body_plain,
            html_body=body_html,
            source_file=file_path.name
        )

    def _parse_msg_file(self, file_path: Path) -> Optional[EmailMessageData]:
        try:
            import extract_msg
            msg = extract_msg.Message(str(file_path))
            return EmailMessageData(
                message_id=file_path.name,
                subject=msg.subject or file_path.stem,
                sender=msg.sender or "Unknown Sender",
                recipients=msg.to or "",
                date=msg.date or datetime.fromtimestamp(file_path.stat().st_mtime),
                raw_body=msg.body or "",
                html_body=msg.htmlBody.decode("utf-8", errors="replace") if isinstance(msg.htmlBody, bytes) else (msg.htmlBody or ""),
                source_file=file_path.name
            )
        except ImportError:
            pass

        try:
            import win32com.client
            outlook = win32com.client.Dispatch("Outlook.Application")
            item = outlook.CreateItemFromTemplate(str(file_path.resolve()))
            return EmailMessageData(
                message_id=file_path.name,
                subject=getattr(item, "Subject", file_path.stem),
                sender=getattr(item, "SenderName", "") + f" <{getattr(item, 'SenderEmailAddress', '')}>",
                recipients="",
                date=getattr(item, "ReceivedTime", None) or datetime.fromtimestamp(file_path.stat().st_mtime),
                raw_body=getattr(item, "Body", ""),
                html_body=getattr(item, "HTMLBody", ""),
                source_file=file_path.name
            )
        except Exception:
            pass

        try:
            with open(file_path, "rb") as f:
                content = f.read().decode("latin-1", errors="replace")
            clean_text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", content)
            return EmailMessageData(
                message_id=file_path.name,
                subject=file_path.stem,
                sender="Outlook Message File",
                recipients="",
                date=datetime.fromtimestamp(file_path.stat().st_mtime),
                raw_body=clean_text[:4000],
                source_file=file_path.name
            )
        except Exception:
            return None

    def _parse_txt_file(self, file_path: Path) -> Optional[EmailMessageData]:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
        except UnicodeDecodeError:
            with open(file_path, "r", encoding="latin-1", errors="replace") as f:
                content = f.read()

        subject = file_path.stem
        sender = "Local File / Email Export"
        date_obj = datetime.fromtimestamp(file_path.stat().st_mtime)

        lines = content.splitlines()
        header_end_idx = 0
        for i, line in enumerate(lines[:15]):
            if line.lower().startswith("subject:"):
                subject = line.split(":", 1)[1].strip()
                header_end_idx = i + 1
            elif line.lower().startswith("from:"):
                sender = line.split(":", 1)[1].strip()
                header_end_idx = i + 1
            elif line.lower().startswith("date:"):
                try:
                    date_obj = email.utils.parsedate_to_datetime(line.split(":", 1)[1].strip())
                    header_end_idx = i + 1
                except Exception:
                    pass

        if header_end_idx > 0 and header_end_idx < len(lines):
            body = "\n".join(lines[header_end_idx:]).strip()
        else:
            body = content.strip()

        return EmailMessageData(
            message_id=file_path.name,
            subject=subject,
            sender=sender,
            recipients="",
            date=date_obj,
            raw_body=body,
            source_file=file_path.name
        )

    def _parse_html_file(self, file_path: Path) -> Optional[EmailMessageData]:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
        except UnicodeDecodeError:
            with open(file_path, "r", encoding="latin-1", errors="replace") as f:
                content = f.read()

        title_match = re.search(r"<title[^>]*>(.*?)</title>", content, re.IGNORECASE | re.DOTALL)
        subject = title_match.group(1).strip() if title_match else file_path.stem

        return EmailMessageData(
            message_id=file_path.name,
            subject=subject,
            sender="Local HTML Email Export",
            recipients="",
            date=datetime.fromtimestamp(file_path.stat().st_mtime),
            raw_body="",
            html_body=content,
            source_file=file_path.name
        )
