"""
Email Dispatcher Module for Sending Generated QC Feedback Excel Reports.
Sends the exact Excel format requirement as a responsive HTML table in the email body,
and attaches the generated Excel file.
"""

import html
import smtplib
from pathlib import Path
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import List, Any


def build_email_table_html(emails_data: List[Any]) -> str:
    """Constructs the HTML table matching the user's Excel format requirement with rowspans."""
    rows_html = []

    for loan_idx, item in enumerate(emails_data, start=1):
        loan_label = f"Loan#{loan_idx}"
        date_str = f"{item.date.month}/{item.date.day}/{item.date.year}" if item.date else ""
        loan_num = str(item.loan_id or "")

        feedback_list = item.feedback_items if item.feedback_items else ["No Feedback"]
        num_items = len(feedback_list)

        for item_idx, feedback_text in enumerate(feedback_list):
            escaped_feedback = html.escape(feedback_text)
            text_align = "center" if feedback_text.strip().lower() == "no feedback" else "left"

            if item_idx == 0:
                # First row of the loan includes rowspan for Example and Date Received
                row_str = f"""
                <tr>
                  <td rowspan="{num_items}" style="padding: 12px 14px; text-align: center; vertical-align: middle; background-color: #543824; color: #ffffff; font-weight: bold; border: 1px solid #ffffff;">{loan_label}</td>
                  <td rowspan="{num_items}" style="padding: 12px 14px; text-align: center; vertical-align: middle; background-color: #1f1f1f; color: #ffffff; border: 1px solid #ffffff;">{date_str}</td>
                  <td style="padding: 12px 14px; text-align: center; vertical-align: middle; background-color: #1f1f1f; color: #ffffff; font-family: monospace; border: 1px solid #ffffff;">{loan_num}</td>
                  <td style="padding: 12px 14px; text-align: {text_align}; vertical-align: middle; background-color: #1f1f1f; color: #ffffff; border: 1px solid #ffffff; line-height: 1.5;">{escaped_feedback}</td>
                </tr>"""
            else:
                # Subsequent rows of the same loan only include Loan Number and QC Feedback
                row_str = f"""
                <tr>
                  <td style="padding: 12px 14px; text-align: center; vertical-align: middle; background-color: #1f1f1f; color: #ffffff; font-family: monospace; border: 1px solid #ffffff;">{loan_num}</td>
                  <td style="padding: 12px 14px; text-align: {text_align}; vertical-align: middle; background-color: #1f1f1f; color: #ffffff; border: 1px solid #ffffff; line-height: 1.5;">{escaped_feedback}</td>
                </tr>"""
            rows_html.append(row_str)

    return "".join(rows_html)


def build_email_table_text(emails_data: List[Any]) -> str:
    """Constructs plain text version of the table."""
    lines = [
        f"{'Example':<10} | {'Date Received':<14} | {'Loan Number':<16} | {'QC Feedback'}",
        "-" * 95
    ]
    for loan_idx, item in enumerate(emails_data, start=1):
        loan_label = f"Loan#{loan_idx}"
        date_str = f"{item.date.month}/{item.date.day}/{item.date.year}" if item.date else ""
        loan_num = str(item.loan_id or "")

        feedback_list = item.feedback_items if item.feedback_items else ["No Feedback"]

        for item_idx, feedback_text in enumerate(feedback_list):
            ex_val = loan_label if item_idx == 0 else ""
            dt_val = date_str if item_idx == 0 else ""
            lines.append(f"{ex_val:<10} | {dt_val:<14} | {loan_num:<16} | {feedback_text}")

    return "\n".join(lines)


def send_qc_report_email(
    excel_path: Path,
    recipients: List[str],
    emails_data: List[Any],
    smtp_server: str,
    smtp_port: int,
    smtp_user: str,
    smtp_pass: str,
    sender_name: str = "True Data QC Automated Reporting"
) -> bool:
    """Sends the formatted QC feedback email with the Excel attachment."""
    if not recipients:
        print("[EmailSender] No recipients specified. Skipping email delivery.")
        return False

    if not smtp_server or not smtp_user or not smtp_pass:
        print("[EmailSender] WARNING: SMTP credentials or server missing. Cannot send email.")
        return False

    if not excel_path.exists():
        print(f"[EmailSender] ERROR: Attachment file does not exist: {excel_path}")
        return False

    total_loans = len(emails_data)
    total_findings = sum(len(e.feedback_items) for e in emails_data)
    subject = f"True Data QC - QC Feedback Report ({total_loans} Loans Processed)"
    sender_header = f"{sender_name} <{smtp_user}>"

    # Plain text version
    table_text = build_email_table_text(emails_data)
    text_content = f"""Hello Team,

Please find below the extracted Quality Control (QC) Feedback matching the required Excel format:

{table_text}

The formatted workbook is also attached: {excel_path.name}

Best regards,
True Data QC Reporting System
"""

    # HTML version with dark-card theme and light-blue headers
    table_html = build_email_table_html(emails_data)
    html_content = f"""<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <title>QC Feedback Report</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#0b0f19" style="padding: 24px 16px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 960px; background-color: #111827; border: 1px solid #374151; border-radius: 8px; overflow: hidden; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);">
          
          <!-- Header Banner -->
          <tr>
            <td bgcolor="#0f172a" style="background-color: #0f172a; padding: 20px 28px; border-bottom: 3px solid #2563eb;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">
                      TRUE DATA <span style="color: #38bdf8;">QC</span>
                    </div>
                    <div style="font-size: 12px; color: #94a3b8; margin-top: 3px;">
                      Quality Control Feedback Extraction Report
                    </div>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; padding: 5px 12px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; background-color: #1e293b; color: #38bdf8; border: 1px solid #0284c7;">
                      EXCEL FORMAT
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 24px 28px;">
              <p style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #e2e8f0;">
                Hello Team,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 13px; line-height: 1.5; color: #94a3b8;">
                Below is the extracted Quality Control feedback matching the exact Excel format requirement:
              </p>

              <!-- Main Table matching screenshot format -->
              <table border="1" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-bottom: 24px; font-size: 13px; border: 1px solid #ffffff;">
                <thead>
                  <tr style="background-color: #c6d9f1; color: #000000;">
                    <th style="padding: 12px 14px; text-align: center; border: 1px solid #ffffff; font-weight: 700; width: 12%;">Example</th>
                    <th style="padding: 12px 14px; text-align: center; border: 1px solid #ffffff; font-weight: 700; width: 15%;">Date Received</th>
                    <th style="padding: 12px 14px; text-align: center; border: 1px solid #ffffff; font-weight: 700; width: 18%;">Loan Number</th>
                    <th style="padding: 12px 14px; text-align: center; border: 1px solid #ffffff; font-weight: 700; width: 55%;">QC Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {table_html}
                </tbody>
              </table>

              <!-- Attachment Box -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#1f2937" style="background-color: #1f2937; border: 1px solid #374151; border-radius: 6px; padding: 12px 16px;">
                <tr>
                  <td style="font-size: 12px; color: #cbd5e1;">
                    📎 <strong>Attachment:</strong> <span style="color: #38bdf8; font-weight: 600;">{excel_path.name}</span> &bull; Total Loans: <strong>{total_loans}</strong> &bull; Total Findings: <strong>{total_findings}</strong>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#0f172a" style="background-color: #0f172a; padding: 14px 28px; text-align: center; border-top: 1px solid #1f2937;">
              <p style="margin: 0; font-size: 11px; color: #64748b;">
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

    # Assemble MIME
    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = sender_header
    msg["To"] = ", ".join(recipients)

    alt_part = MIMEMultipart("alternative")
    alt_part.attach(MIMEText(text_content, "plain"))
    alt_part.attach(MIMEText(html_content, "html"))
    msg.attach(alt_part)

    # Attach Excel Workbook
    try:
        with open(excel_path, "rb") as f:
            part = MIMEBase("application", "vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{excel_path.name}"')
        msg.attach(part)
    except Exception as e:
        print(f"[EmailSender] ERROR attaching file {excel_path}: {e}")
        return False

    # Send
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
    except Exception as e:
        print(f"[EmailSender] ERROR sending email: {e}")
        return False
