import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from app.config import EMAIL_USER, EMAIL_PASS, SMTP_SERVER, SMTP_PORT
from app.logger import log_event

def _send_smtp_email(
    recipient_email: str,
    subject: str,
    text_content: str,
    html_content: str,
    email_type: str = "NOTIFICATION",
    raise_on_error: bool = False
) -> bool:
    """
    Internal helper to construct and send an email via Microsoft Office 365 SMTP.
    """
    if not EMAIL_USER or not EMAIL_PASS or not SMTP_SERVER:
        log_event("WARNING", "EMAIL_CONFIG_MISSING", f"SMTP credentials or server configuration is missing. Could not send {email_type} email to {recipient_email}")
        if raise_on_error:
            raise ValueError("Email service is not configured on the server.")
        return False

    sender_name = "True Data QC Support"
    sender_header = f"{sender_name} <{EMAIL_USER}>"

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
        log_event("INFO", "EMAIL_SENT", f"{email_type} email successfully sent to {recipient_email}", email=recipient_email)
        return True
    except Exception as e:
        log_event("ERROR", "EMAIL_SEND_FAILED", f"Failed sending {email_type} email to {recipient_email}: {str(e)}", email=recipient_email)
        if raise_on_error:
            raise e
        return False

def send_otp_email(recipient_email: str, otp_code: str, expiry_minutes: int = 10) -> bool:
    """
    Sends a 6-digit One-Time Password (OTP) to the recipient email via Microsoft Office 365 SMTP.
    """
    subject = "True Data QC - Password Reset Verification Code"
    sender_name = "True Data QC Support"

    # Plain text version
    text_content = f"""Hello,

We received a request to reset your password for your True Data QC account.

Your verification code is: {otp_code}

This code will expire in {expiry_minutes} minutes.
If you did not request a password reset, please ignore this email or contact your system administrator.

Best regards,
True Data QC Team
"""

    # HTML version (Bulletproof table-based layout, high contrast, zero-gradient fallback)
    html_content = f"""<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>True Data QC - Password Reset Verification</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, p, a, span {{ font-family: -apple-system, Segoe UI, Arial, sans-serif !important; }}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #0f172a;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f1f5f9" style="background-color: #f1f5f9; padding: 36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);">
          
          <!-- Institutional Header -->
          <tr>
            <td bgcolor="#0f172a" style="background-color: #0f172a; padding: 26px 32px; text-align: left;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px; line-height: 1.2;">
                      TRUE DATA <span style="color: #38bdf8;">QC</span>
                    </div>
                  </td>
                  <td align="right" valign="middle">
                    <span style="display: inline-block; padding: 5px 12px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; background-color: #1e293b; color: #60a5fa; border: 1px solid #1e3a8a;">
                      VERIFICATION
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Blue Accent Bar -->
          <tr>
            <td height="4" bgcolor="#2563eb" style="background-color: #2563eb; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 32px 28px 32px;">

              <!-- Notice Box -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#eff6ff" style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-left: 5px solid #2563eb; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 11px; font-weight: 800; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px;">
                      Security Request
                    </div>
                    <div style="font-size: 17px; font-weight: 700; color: #1e3a8a; line-height: 1.3;">
                      Password Reset Verification
                    </div>
                    <div style="font-size: 13px; color: #2563eb; margin-top: 4px; line-height: 1.4;">
                      Use the 6-digit one-time passcode below to verify your identity.
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 700; color: #0f172a;">
                Hello,
              </p>
              <p style="margin: 0 0 22px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                We received a request to reset the password associated with your <strong>True Data QC</strong> account. Enter this one-time code to authenticate and choose a new password:
              </p>

              <!-- OTP Code Display Card -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f8fafc" style="background-color: #f8fafc; border: 2px dashed #94a3b8; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td align="center" style="padding: 24px 20px;">
                    <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                      Your One-Time Passcode
                    </div>
                    <div style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #0f172a; padding: 6px 0; line-height: 1.2;">
                      {otp_code}
                    </div>
                    <div style="font-size: 12px; font-weight: 600; color: #475569; margin-top: 10px;">
                      Valid for <strong>{expiry_minutes} minutes</strong>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Security Information Note -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f8fafc" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0f172a; border-radius: 4px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 14px 18px;">
                    <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
                      Important Security Advisory
                    </div>
                    <div style="font-size: 13px; line-height: 1.5; color: #334155;">
                      Never share this code with anyone. True Data QC support and IT administrators will never request your one-time code.
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #64748b;">
                If you did not initiate this request, you can safely disregard this email. Your current password remains secure and unchanged.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#f8fafc" style="background-color: #f8fafc; padding: 20px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #475569;">
                True Data QC &bull; Automated Security Notification
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                &copy; True Data QC Team. All rights reserved. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    return _send_smtp_email(recipient_email, subject, text_content, html_content, email_type="OTP", raise_on_error=True)

def send_account_approved_email(recipient_email: str, username: str) -> bool:
    """
    Sends an account approval and activation confirmation email to the user.
    """
    subject = "True Data QC - Account Activation Confirmation"
    sender_name = "True Data QC Support"

    text_content = f"""Hello {username},

Great news! Your True Data QC account registration has been reviewed and approved by an administrator.

Your account is now ACTIVE and ready to use.

Account Details:
- Username: {username}
- Registered Email: {recipient_email}
- Account Status: Active

You can now log in to the True Data QC platform with your registered email and password.

If you have any questions or require assistance getting started, please contact your system administrator.

Best regards,
True Data QC Team
"""

    html_content = f"""<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>True Data QC - Account Activation Confirmation</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, p, a, span {{ font-family: -apple-system, Segoe UI, Arial, sans-serif !important; }}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #0f172a;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f1f5f9" style="background-color: #f1f5f9; padding: 36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);">
          
          <!-- Institutional Brand Header -->
          <tr>
            <td bgcolor="#0f172a" style="background-color: #0f172a; padding: 26px 32px; text-align: left;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px; line-height: 1.2;">
                      TRUE DATA <span style="color: #38bdf8;">QC</span>
                    </div>
                  </td>
                  <td align="right" valign="middle">
                    <span style="display: inline-block; padding: 5px 12px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; background-color: #1e293b; color: #10b981; border: 1px solid #065f46;">
                      ● ACTIVATED
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Emerald Accent Bar -->
          <tr>
            <td height="4" bgcolor="#10b981" style="background-color: #10b981; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 32px 28px 32px;">

              <!-- Status Banner -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#ecfdf5" style="background-color: #ecfdf5; border: 1px solid #86efac; border-left: 5px solid #10b981; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 11px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px;">
                      Registration Approved
                    </div>
                    <div style="font-size: 17px; font-weight: 700; color: #064e3b; line-height: 1.3;">
                      Your Account Is Active & Ready
                    </div>
                    <div style="font-size: 13px; color: #047857; margin-top: 4px; line-height: 1.4;">
                      An administrator has verified and approved your account credentials.
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Greeting & Introduction -->
              <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 700; color: #0f172a;">
                Hello {username},
              </p>
              <p style="margin: 0 0 22px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                Welcome to <strong>True Data QC</strong>! Your registration request has been successfully approved by an administrator. You now have full access to sign in and use the platform.
              </p>

              <!-- Account Details Box -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f8fafc" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; width: 38%;">
                    Username
                  </td>
                  <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 700; color: #0f172a;">
                    {username}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">
                    Registered Email
                  </td>
                  <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; color: #0f172a;">
                    {recipient_email}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">
                    Account Status
                  </td>
                  <td style="padding: 12px 18px;">
                    <span style="display: inline-block; padding: 4px 12px; background-color: #059669; color: #ffffff; font-size: 12px; font-weight: 800; letter-spacing: 0.5px; border-radius: 4px;">
                      ACTIVE
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Login Guidance Note -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f8fafc" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0f172a; border-radius: 4px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 14px 18px;">
                    <div style="font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
                      How to Log In
                    </div>
                    <div style="font-size: 13px; line-height: 1.5; color: #334155;">
                      Navigate to the True Data QC login screen and sign in using your registered email (<strong>{recipient_email}</strong>) and your password.
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #64748b;">
                If you encounter any issues logging in or require specific role permissions, please contact your system administrator or internal IT department.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#f8fafc" style="background-color: #f8fafc; padding: 20px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #475569;">
                True Data QC &bull; Automated System Notification
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                &copy; True Data QC Team. All rights reserved. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    return _send_smtp_email(recipient_email, subject, text_content, html_content, email_type="ACCOUNT_APPROVED", raise_on_error=False)

def send_account_rejected_email(recipient_email: str, username: str) -> bool:
    """
    Sends an account registration rejection notice to the user.
    """
    subject = "True Data QC - Registration Status Update"
    sender_name = "True Data QC Support"

    text_content = f"""Hello {username},

Thank you for your interest in True Data QC.

We are writing to inform you that your request for account registration associated with email {recipient_email} has been reviewed and could not be approved at this time.

Registration Details:
- Username: {username}
- Registered Email: {recipient_email}
- Status: Not Approved

This decision has been logged for internal security and audit compliance.

Best regards,
True Data QC Team
"""

    html_content = f"""<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>True Data QC - Registration Status Update</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td, p, a, span {{ font-family: -apple-system, Segoe UI, Arial, sans-serif !important; }}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #0f172a;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f1f5f9" style="background-color: #f1f5f9; padding: 36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);">
          
          <!-- Institutional Brand Header -->
          <tr>
            <td bgcolor="#0f172a" style="background-color: #0f172a; padding: 26px 32px; text-align: left;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px; line-height: 1.2;">
                      TRUE DATA <span style="color: #38bdf8;">QC</span>
                    </div>
                  </td>
                  <td align="right" valign="middle">
                    <span style="display: inline-block; padding: 5px 12px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; background-color: #1e293b; color: #f87171; border: 1px solid #7f1d1d;">
                      ● STATUS UPDATE
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Crimson Accent Bar -->
          <tr>
            <td height="4" bgcolor="#ef4444" style="background-color: #ef4444; font-size: 0; line-height: 0;">&nbsp;</td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 32px 28px 32px;">

              <!-- Status Notice Banner -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#fef2f2" style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 5px solid #dc2626; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 11px; font-weight: 800; color: #991b1b; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px;">
                      Registration Review Decision
                    </div>
                    <div style="font-size: 17px; font-weight: 700; color: #7f1d1d; line-height: 1.3;">
                      Account Registration Not Approved
                    </div>
                    <div style="font-size: 13px; color: #991b1b; margin-top: 4px; line-height: 1.4;">
                      Your request for platform access has been reviewed by the administrative team.
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Greeting & Introduction -->
              <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 700; color: #0f172a;">
                Hello {username},
              </p>
              <p style="margin: 0 0 22px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                Thank you for submitting a registration request for <strong>True Data QC</strong>. Following internal administrative review, your request for account activation associated with <strong>{recipient_email}</strong> could not be approved at this time.
              </p>

              <!-- Account Details Box -->
              <table border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f8fafc" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; width: 38%;">
                    Requested Username
                  </td>
                  <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 700; color: #0f172a;">
                    {username}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">
                    Registered Email
                  </td>
                  <td style="padding: 12px 18px; border-bottom: 1px solid #e2e8f0; font-size: 14px; font-weight: 600; color: #0f172a;">
                    {recipient_email}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 18px; font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">
                    Review Outcome
                  </td>
                  <td style="padding: 12px 18px;">
                    <span style="display: inline-block; padding: 4px 12px; background-color: #dc2626; color: #ffffff; font-size: 12px; font-weight: 800; letter-spacing: 0.5px; border-radius: 4px;">
                      NOT APPROVED
                    </span>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #64748b;">
                This decision has been logged for internal security and audit compliance.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#f8fafc" style="background-color: #f8fafc; padding: 20px 32px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #475569;">
                True Data QC &bull; Automated System Notification
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                &copy; True Data QC Team. All rights reserved. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    return _send_smtp_email(recipient_email, subject, text_content, html_content, email_type="ACCOUNT_REJECTED", raise_on_error=False)
