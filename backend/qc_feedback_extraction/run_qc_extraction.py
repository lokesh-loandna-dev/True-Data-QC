"""
Master Execution Script for QC Feedback Extraction from Local Email Folder.

Workflow:
1. Prompts for or accepts the folder location containing sample emails (.eml, .msg, .txt, .html).
2. Extracts and parses the email bodies and QC feedback fields (Loan ID, Borrower, QC Status, Observations, Action Required).
3. Generates a multi-tab institutional Excel report.
4. Reads RECIPIENT_EMAILS from backend/.env and dispatches the Excel report via SMTP.

Usage:
  python run_qc_extraction.py
  python run_qc_extraction.py --folder "C:\\path\\to\\my_emails"
  python run_qc_extraction.py --dry-run
"""

import sys
import argparse
from pathlib import Path
from typing import List

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from config import (
    DEFAULT_SAMPLE_EMAIL_DIR,
    RECIPIENT_EMAILS,
    SMTP_SERVER,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    OUTPUT_DIR,
    EXCEL_FILENAME_PREFIX,
    SENDER_DISPLAY_NAME
)
from extractor import LocalEmailFolderExtractor, EmailMessageData
from excel_generator import QCExcelReportGenerator
from email_sender import send_qc_report_email


def prompt_for_email_folder(default_dir: Path) -> Path:
    """
    Interactively asks the user for the folder location if not passed via CLI.
    """
    print("\n[Input Required] Please specify the folder containing your sample email files (.eml, .msg, .txt, .html):")
    print(f"  (Press Enter to use default: {default_dir})")

    while True:
        try:
            user_input = input("Email folder path: ").strip().strip("\"' ")
        except (KeyboardInterrupt, EOFError):
            print("\nOperation cancelled by user.")
            sys.exit(0)

        if not user_input:
            target_path = default_dir
        else:
            target_path = Path(user_input).expanduser().resolve()

        if target_path.exists() and target_path.is_dir():
            return target_path
        else:
            print(f"  ❌ Error: Directory not found: '{target_path}'. Please re-enter a valid directory.")


def run_extraction_pipeline(
    folder_path: Path,
    recipients: List[str] = None,
    dry_run: bool = False
):
    print("=" * 75)
    print(" TRUE DATA QC - LOCAL EMAIL QC FEEDBACK EXTRACTION PIPELINE")
    print("=" * 75)
    print(f"Email Source Folder : {folder_path.resolve()}")
    target_recipients = recipients or RECIPIENT_EMAILS
    print(f"Recipients from .env: {', '.join(target_recipients)}")
    print(f"Dry Run (No Email)  : {dry_run}")
    print("=" * 75)

    # STEP 1: Extract email files from folder
    print(f"\n[Step 1/3] Scanning and extracting emails from folder...")
    extractor = LocalEmailFolderExtractor(folder_path=folder_path)
    emails_data = extractor.extract_all()

    if not emails_data:
        print(f"\n⚠️  No valid email files (.eml, .msg, .txt, .html) found in:")
        print(f"    {folder_path.resolve()}")
        print("\nPlease place your email files in this folder and try again.")
        return

    print(f"\n[Step 2/3] Successfully parsed {len(emails_data)} QC feedback record(s):")
    for idx, em in enumerate(emails_data, 1):
        items_cnt = len(em.feedback_items)
        first_item = em.feedback_items[0][:60] + "..." if em.feedback_items else "No Feedback"
        print(f"  {idx}. Loan Number: {em.loan_id or 'N/A'} | Items: {items_cnt} | Snippet: {first_item}")

    # STEP 2: Generate formatted Excel Report
    print(f"\n[Step 3/3] Generating institutional QC Excel report...")
    generator = QCExcelReportGenerator(output_dir=OUTPUT_DIR)
    excel_file = generator.generate_report(emails_data, filename_prefix=EXCEL_FILENAME_PREFIX)
    print(f"  ✓ Output File: {excel_file.resolve()}")

    # STEP 3: Dispatch Report via Email
    if dry_run:
        print(f"\n[Delivery] DRY RUN MODE ENABLED - Skipping email delivery.")
        print(f"  The generated report is saved locally at:\n  {excel_file.resolve()}")
    else:
        if not target_recipients:
            print("\n⚠️  Notice: No recipient email addresses found in backend/.env under RECIPIENT_EMAILS.")
            print(f"  The generated report is saved locally at:\n  {excel_file.resolve()}")
            return

        if not SMTP_USER or not SMTP_PASS:
            print("\n⚠️  Notice: SMTP credentials (EMAIL_USER / EMAIL_PASS) not configured in backend/.env.")
            print(f"  The generated report is saved locally at:\n  {excel_file.resolve()}")
            return

        print(f"\n[Delivery] Dispatching email to {len(target_recipients)} recipient(s) mentioned in .env:")
        for r in target_recipients:
            print(f"  - {r}")

        success = send_qc_report_email(
            excel_path=excel_file,
            recipients=target_recipients,
            emails_data=emails_data,
            smtp_server=SMTP_SERVER,
            smtp_port=SMTP_PORT,
            smtp_user=SMTP_USER,
            smtp_pass=SMTP_PASS,
            sender_name=SENDER_DISPLAY_NAME
        )

        if success:
            print("\n✅ Success: QC Feedback Excel report sent successfully to recipients!")
        else:
            print("\n❌ Notice: Could not send email via SMTP. Please check credentials in backend/.env.")

    print("\n" + "=" * 75)
    print(" PIPELINE EXECUTION COMPLETED")
    print("=" * 75)


def main():
    parser = argparse.ArgumentParser(description="QC Feedback Extractor from Local Email Folder")
    parser.add_argument("-f", "--folder", type=str, default=None, help="Path to folder containing email files (.eml, .msg, .txt, .html)")
    parser.add_argument("--dry-run", action="store_true", help="Extract and build Excel without sending email")
    parser.add_argument("--recipients", nargs="+", default=None, help="Override recipient emails from .env")

    args = parser.parse_args()

    # Determine folder path
    if args.folder:
        folder_path = Path(args.folder).expanduser().resolve()
        if not folder_path.exists() or not folder_path.is_dir():
            print(f"Error: Specified folder does not exist: {folder_path}")
            sys.exit(1)
    else:
        # Prompt interactively in script
        folder_path = prompt_for_email_folder(default_dir=DEFAULT_SAMPLE_EMAIL_DIR)

    run_extraction_pipeline(
        folder_path=folder_path,
        recipients=args.recipients,
        dry_run=args.dry_run
    )


if __name__ == "__main__":
    main()
