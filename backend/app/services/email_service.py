import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.config import EMAIL_USER, EMAIL_PASS, SMTP_SERVER, SMTP_PORT
from app.logger import log_event

def send_otp_email(recipient_email: str, otp_code: str, expiry_minutes: int = 10) -> bool:
    """
    Sends a 6-digit One-Time Password (OTP) to the recipient email via Microsoft Office 365 SMTP.
    """
    if not EMAIL_USER or not EMAIL_PASS or not SMTP_SERVER:
        log_event("ERROR", "EMAIL_CONFIG_MISSING", "SMTP credentials or server configuration is missing in environment variables.")
        raise ValueError("Email service is not configured on the server.")

    subject = "True Data QC - Password Reset Verification Code"
    sender_name = "True Data QC Support"
    sender_header = f"{sender_name} <{EMAIL_USER}>"

    # Plain text version
    text_content = f"""Hello,

We received a request to reset your password for your True Data QC account.

Your verification code is: {otp_code}

This code will expire in {expiry_minutes} minutes.
If you did not request a password reset, please ignore this email or contact your system administrator.

Best regards,
True Data QC Team
"""

    # HTML version
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Password Reset OTP</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 24px;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #e5e7eb;">
    <tr>
      <td style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">True Data QC</h1>
        <p style="color: #dbeafe; margin: 6px 0 0 0; font-size: 14px;">Password Reset Verification</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px 28px;">
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 15px; line-height: 1.5;">
          Hello,
        </p>
        <p style="margin: 0 0 24px 0; color: #4b5563; font-size: 14px; line-height: 1.5;">
          We received a request to reset your password for your <strong>True Data QC</strong> account. Please use the verification code below to proceed:
        </p>
        <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
          <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #1e3a8a; display: inline-block;">{otp_code}</span>
          <p style="margin: 10px 0 0 0; color: #64748b; font-size: 13px;">Valid for <strong>{expiry_minutes} minutes</strong></p>
        </div>
        <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 13px; line-height: 1.4;">
          <strong>Security Notice:</strong> Never share this code with anyone. Our team will never ask for your verification code.
        </p>
        <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.4;">
          If you did not request this password reset, you can safely ignore this email. Your password will remain unchanged.
        </p>
      </td>
    </tr>
    <tr>
      <td style="background-color: #f9fafb; padding: 16px 28px; text-align: center; border-top: 1px solid #f3f4f6;">
        <p style="margin: 0; color: #9ca3af; font-size: 11px;">
          &copy; {sender_name}. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender_header
    msg["To"] = recipient_email

    msg.attach(MIMEText(text_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=20)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(EMAIL_USER, EMAIL_PASS)
        server.sendmail(EMAIL_USER, [recipient_email], msg.as_string())
        server.quit()
        log_event("INFO", "EMAIL_SENT", f"OTP verification email successfully sent to {recipient_email}", email=recipient_email)
        return True
    except Exception as e:
        log_event("ERROR", "EMAIL_SEND_FAILED", f"Failed sending OTP email to {recipient_email}: {str(e)}", email=recipient_email)
        raise e
