"""
Email Dispatcher Module for Sending Generated QC Feedback Excel Reports.
Prepares executive email layout with summary metrics and attaches the generated Excel workbook.
"""

import smtplib
from pathlib import Path
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import List


def send_qc_report_email(
    excel_path: Path,
    recipients: List[str],
    smtp_server: str,
    smtp_port: int,
    smtp_user: str,
    smtp_pass: str,
    total_emails_processed: int,
    loan_ids_found: List[str],
    sender_name: str = "True Data QC Automated Reporting"
) -> bool:
    """Sends an executive notification email with the generated Excel report attached."""
    if not recipients:
        print("[EmailSender] No recipients specified. Skipping email dispatch.")
        return False

    if not smtp_server or not smtp_user or not smtp_pass:
        print("[EmailSender] WARNING: SMTP credentials or server missing. Cannot send email.")
        return False

    if not excel_path.exists():
        print(f"[EmailSender] ERROR: Attachment file does not exist: {excel_path}")
        return False

    subject = f"True Data QC - Extracted QC Feedback Report ({len(loan_ids_found)} Loans / {total_emails_processed} Emails)"
    sender_header = f"{sender_name} <{smtp_user}>"
    clean_loan_list = ", ".join(filter(None, loan_ids_found[:10]))
    if len(loan_ids_found) > 10:
        clean_loan_list += f" (+{len(loan_ids_found) - 10} more)"
    if not clean_loan_list:
        clean_loan_list = "None identified"

    text_content = f"""Hello Team,

Please find attached the automated Quality Control (QC) Feedback extraction report.

Summary:
- Total Emails Processed: {total_emails_processed}
- Identified Loan IDs: {clean_loan_list}
- Attached File: {excel_path.name}

The attached Excel spreadsheet includes:
1. QC Feedback Summary (Status, Reviewer, Loan ID, Error Category, Feedback)
2. Detailed Findings / Table Items
3. Raw Email Audit Log

Best regards,
True Data QC Reporting System
"""

    html_content = f"""<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <title>True Data QC - Feedback Extraction Report</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f1f5f9" style="padding: 32px 16px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);">
          <tr>
            <td bgcolor="#0f172a" style="background-color: #0f172a; padding: 24px 32px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">
                      TRUE DATA <span style="color: #38bdf8;">QC</span>
                    </div>
                    <div style="font-size: 12px; color: #94a3b8; margin-top: 3px;">
                      Automated Quality Control Feedback System
                    </div>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; background-color: #1e293b; color: #38bdf8; border: 1px solid #0284c7;">
                      FEEDBACK REPORT
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td height="4" bgcolor="#2563eb" style="background-color: #2563eb; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding: 28px 32px;">
              <p style="margin: 0 0 14px 0; font-size: 15px; font-weight: 700; color: #0f172a;">
                Hello Team,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                The automated mailbox reader has processed the latest QC feedback emails and generated a structured Excel report. Please review the attached spreadsheet for detailed observations and action items.
              </p>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f8fafc" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; color: #475569; width: 40%;">
                    Emails Processed
                  </td>
                  <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 800; color: #0f172a;">
                    {total_emails_processed}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; color: #475569;">
                    Identified Loan IDs
                  </td>
                  <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #1e40af;">
                    {clean_loan_list}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 12px; font-weight: 700; color: #475569;">
                    Attached Workbook
                  </td>
                  <td style="padding: 12px 18px; font-size: 13px; font-weight: 700; color: #059669;">
                    📎 {excel_path.name}
                  </td>
                </tr>
              </table>
              <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#eff6ff" style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #2563eb; border-radius: 4px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 12px 16px;">
                    <div style="font-size: 12px; font-weight: 700; color: #1e3a8a; margin-bottom: 2px;">
                      Report Structure
                    </div>
                    <div style="font-size: 12px; line-height: 1.5; color: #1e40af;">
                      The workbook contains 3 tabs: <strong>QC Feedback Summary</strong>, <strong>QC Detailed Findings</strong>, and the <strong>Email Audit Log</strong>.
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #64748b;">
                This is an automated delivery. For questions regarding the audit findings, please contact the respective QC analyst listed in the sheet.
              </p>
            </td>
          </tr>
          <tr>
            <td bgcolor="#f8fafc" style="background-color: #f8fafc; padding: 16px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                &copy; True Data QC Reporting System &bull; Confidential Internal Report
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = sender_header
    msg["To"] = ", ".join(recipients)

    alt_part = MIMEMultipart("alternative")
    alt_part.attach(MIMEText(text_content, "plain"))
    alt_part.attach(MIMEText(html_content, "html"))
    msg.attach(alt_part)

    try:
        with open(excel_path, "rb") as f:
            part = MIMEBase("application", "vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{excel_path.name}"')
        msg.attach(part)
    except Exception as attach_err:
        print(f"[EmailSender] ERROR: Failed attaching file {excel_path}: {str(attach_err)}")
        return False

    try:
        print(f"[EmailSender] Connecting to SMTP server {smtp_server}:{smtp_port}...")
        server = smtplib.SMTP(smtp_server, smtp_port, timeout=30)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_user, recipients, msg.as_string())
        server.quit()
        print(f"[EmailSender] SUCCESS: QC Feedback report dispatched to: {', '.join(recipients)}")
        return True
    except Exception as send_err:
        print(f"[EmailSender] ERROR: Failed sending email: {str(send_err)}")
        return False
