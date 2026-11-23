"""
Master Execution Script for QC Feedback Extraction and Delivery.

Workflow:
1. Connects to Mailbox (via IMAP or Windows Outlook Desktop COM).
2. Searches and fetches QC feedback emails.
3. Cleans and extracts email bodies, metadata, and structured QC fields.
4. Generates a formatted institutional Excel report.
5. Sends the generated Excel report to specified recipient email addresses.

Usage:
  python run_qc_extraction.py
  python run_qc_extraction.py --dry-run
  python run_qc_extraction.py --test-sample --dry-run
  python run_qc_extraction.py --days 14 --limit 20
  python run_qc_extraction.py --recipients manager@loandna.com test@loandna.com
"""

import sys
import argparse
from datetime import datetime
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from config import (
    MAILBOX_USER,
    MAILBOX_PASS,
    IMAP_SERVER,
    IMAP_PORT,
    MAILBOX_FOLDER,
    EXTRACTION_MODE,
    SUBJECT_FILTER_KEYWORDS,
    DEFAULT_DAYS_BACK,
    MAX_EMAILS_FETCH,
    MARK_AS_READ,
    RECIPIENT_EMAILS,
    SMTP_SERVER,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    OUTPUT_DIR,
    EXCEL_FILENAME_PREFIX,
    SENDER_DISPLAY_NAME
)
from extractor import MailboxExtractor, EmailMessageData
from excel_generator import QCExcelReportGenerator
from email_sender import send_qc_report_email


def generate_sample_test_data() -> list[EmailMessageData]:
    """Generates synthetic QC feedback records to verify the pipeline."""
    sample_1 = EmailMessageData(
        message_id="TEST-MSG-001",
        subject="QC Feedback - Loan 84729103 - Discrepancy Found in Borrower Income",
        sender="Quality Control Team <qc-auditor@loandna.com>",
        recipients=MAILBOX_USER,
        date=datetime.now(),
        raw_body="""Hello Team,

Please review the QC feedback for the following loan package:
Loan ID: 84729103
Borrower Name: Robert M. Chen
Review Type: Pre-UW QC
QC Status: Failed / Discrepancy Found
QC Analyst: Sarah Jenkins

Defect Category: Income Calculation Variance
Observations:
1. Base pay on paystub dated 10/15/2026 indicates $8,200/mo, but 1003 application states $9,500/mo.
2. Missing W-2 document for secondary co-borrower.

Action Required: Please update income fields in True Data and re-upload supporting W-2.

Best regards,
Sarah Jenkins
Senior QC Underwriting Analyst
""",
        html_body=""
    )

    sample_2 = EmailMessageData(
        message_id="TEST-MSG-002",
        subject="QC Review Passed - Loan 91823746 - Junior UW Verification Cleared",
        sender="Emily Watson <ewatson@loandna.com>",
        recipients=MAILBOX_USER,
        date=datetime.now(),
        raw_body="""Loan ID: 91823746
Borrower Name: Amanda Lewis
Review Type: Junior UW QC
QC Status: Passed / Approved
QC Analyst: Emily Watson

Observations: All data fields and macro rules successfully verified against data dictionary. No discrepancies found.
Action Required: None. Ready for underwriter sign-off.
""",
        html_body=""
    )

    sample_3 = EmailMessageData(
        message_id="TEST-MSG-003",
        subject="QC Feedback - Loan 55210984 - Action Required on Property Address & Tax ID",
        sender="David Miller <dmiller@loandna.com>",
        recipients=MAILBOX_USER,
        date=datetime.now(),
        raw_body="""Loan Number: 55210984
Borrower Name: Michael Rodriguez
Review Type: Pre-UW QC
QC Status: Action Required
QC Analyst: David Miller
Defect Category: Property & Collateral Discrepancy

Observations:
- Property zip code in appraisal report (92101) differs from Title commitment (92103).
- Missing flood hazard certification.

Next Steps: Clarify zip code with escrow and obtain updated flood cert.
""",
        html_body=""
    )

    return [sample_1, sample_2, sample_3]


def run_pipeline(
    mailbox_user: str = MAILBOX_USER,
    mailbox_pass: str = MAILBOX_PASS,
    folder: str = MAILBOX_FOLDER,
    days_back: int = DEFAULT_DAYS_BACK,
    max_emails: int = MAX_EMAILS_FETCH,
    subject_filter: list = None,
    recipients: list = None,
    mode: str = EXTRACTION_MODE,
    dry_run: bool = False,
    test_sample: bool = False
):
    print("=" * 75)
    print(" TRUE DATA QC - AUTOMATED QC FEEDBACK EXTRACTION PIPELINE")
    print("=" * 75)
    print(f"Mailbox User       : {mailbox_user}")
    print(f"Target Folder      : {folder}")
    print(f"Lookback Days      : {days_back}")
    print(f"Extraction Mode    : {mode}")
    print(f"Recipients         : {', '.join(recipients or RECIPIENT_EMAILS)}")
    print(f"Dry Run (No Send)  : {dry_run}")
    print("=" * 75)

    keywords = subject_filter if subject_filter is not None else SUBJECT_FILTER_KEYWORDS
    target_recipients = recipients if recipients is not None else RECIPIENT_EMAILS

    emails_data = []
    if test_sample:
        print("\n[Step 1/4] Running in TEST SAMPLE mode. Generating synthetic QC records...")
        emails_data = generate_sample_test_data()
    else:
        print("\n[Step 1/4] Connecting to mailbox and retrieving emails...")
        extractor = MailboxExtractor(
            username=mailbox_user,
            password=mailbox_pass,
            server=IMAP_SERVER,
            port=IMAP_PORT
        )

        if mode == "outlook":
            emails_data = extractor.fetch_emails_outlook_desktop(
                folder_name=folder,
                days_back=days_back,
                subject_keywords=keywords,
                max_emails=max_emails
            )
        else:
            emails_data = extractor.fetch_emails_imap(
                folder=folder,
                days_back=days_back,
                subject_keywords=keywords,
                max_emails=max_emails,
                mark_as_read=MARK_AS_READ
            )
            if not emails_data and mode == "auto" and sys.platform == "win32":
                print("[Step 1/4] Attempting Windows Outlook Desktop COM extraction fallback...")
                emails_data = extractor.fetch_emails_outlook_desktop(
                    folder_name=folder,
                    days_back=days_back,
                    subject_keywords=keywords,
                    max_emails=max_emails
                )

    if not emails_data:
        print("\n[Notice] No QC feedback emails were found matching the specified criteria.")
        print("Pipeline finished.")
        return

    print(f"\n[Step 2/4] Successfully parsed {len(emails_data)} QC feedback email(s).")
    for idx, em in enumerate(emails_data, 1):
        print(f"  {idx}. Loan: {em.loan_id or 'N/A'} | Status: {em.qc_status} | Subject: {em.subject[:50]}...")

    print("\n[Step 3/4] Generating institutional QC Excel report...")
    generator = QCExcelReportGenerator(output_dir=OUTPUT_DIR)
    excel_file = generator.generate_report(emails_data, filename_prefix=EXCEL_FILENAME_PREFIX)
    print(f"  Generated File: {excel_file}")

    if dry_run:
        print("\n[Step 4/4] DRY RUN MODE ENABLED - Skipping email delivery.")
        print(f"  The report is saved locally at:\n  {excel_file.resolve()}")
    else:
        print(f"\n[Step 4/4] Sending report to {len(target_recipients)} recipient(s)...")
        distinct_loans = list(dict.fromkeys([em.loan_id for em in emails_data if em.loan_id]))
        success = send_qc_report_email(
            excel_path=excel_file,
            recipients=target_recipients,
            smtp_server=SMTP_SERVER,
            smtp_port=SMTP_PORT,
            smtp_user=SMTP_USER,
            smtp_pass=SMTP_PASS,
            total_emails_processed=len(emails_data),
            loan_ids_found=distinct_loans,
            sender_name=SENDER_DISPLAY_NAME
        )
        if success:
            print("  QC Feedback report successfully dispatched via email!")
        else:
            print("  Email dispatch encountered an issue. Please verify SMTP credentials.")

    print("\n" + "=" * 75)
    print(" PIPELINE EXECUTION COMPLETED")
    print("=" * 75)


def main():
    parser = argparse.ArgumentParser(description="QC Feedback Mailbox Extractor & Excel Emailer")
    parser.add_argument("--mailbox", type=str, default=MAILBOX_USER, help="Mailbox user / email address")
    parser.add_argument("--password", type=str, default=MAILBOX_PASS, help="Mailbox password")
    parser.add_argument("--folder", type=str, default=MAILBOX_FOLDER, help="Mailbox folder name (e.g. INBOX)")
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS_BACK, help="Number of past days to extract")
    parser.add_argument("--limit", type=int, default=MAX_EMAILS_FETCH, help="Max emails to process")
    parser.add_argument("--subject", type=str, default=None, help="Comma-separated subject keyword filters")
    parser.add_argument("--recipients", nargs="+", default=None, help="Recipient email addresses to receive Excel")
    parser.add_argument("--method", choices=["auto", "imap", "outlook"], default=EXTRACTION_MODE, help="Extraction method")
    parser.add_argument("--dry-run", action="store_true", help="Generate Excel without sending email")
    parser.add_argument("--test-sample", action="store_true", help="Run with synthetic sample QC feedback data")

    args = parser.parse_args()
    subject_filter = [s.strip() for s in args.subject.split(",")] if args.subject else None

    run_pipeline(
        mailbox_user=args.mailbox,
        mailbox_pass=args.password,
        folder=args.folder,
        days_back=args.days,
        max_emails=args.limit,
        subject_filter=subject_filter,
        recipients=args.recipients,
        mode=args.method,
        dry_run=args.dry_run,
        test_sample=args.test_sample
    )


if __name__ == "__main__":
    main()
