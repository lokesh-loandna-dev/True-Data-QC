import logging
from logging.handlers import TimedRotatingFileHandler
import os
import re
from datetime import datetime, timezone, timedelta

# Ensure logs directory exists inside backend directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "backend.log")

# Create dedicated backend logger
logger = logging.getLogger("ops_qc_backend")
logger.setLevel(logging.INFO)

# Formatter displaying timestamp, log level, action, username, email, and clear issue statement with fixed column alignment
class StructuredLogFormatter(logging.Formatter):
    def format(self, record):
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        username = str(getattr(record, 'username', 'N/A') or 'N/A')
        email = str(getattr(record, 'email', 'N/A') or 'N/A')
        action = str(getattr(record, 'action', 'GENERAL') or 'GENERAL')
        raw_issue = getattr(record, 'issue', None)
        if raw_issue is None:
            raw_issue = record.getMessage()
        
        # Clean and sanitize issue message (replace newlines to ensure single-line column alignment)
        issue_str = str(raw_issue)
        lines = [line.strip() for line in issue_str.replace("\r\n", "\n").replace("\r", "\n").split("\n") if line.strip()]
        clean_issue = " | ".join(lines) if lines else ""
        
        if record.exc_info:
            if not record.exc_text:
                record.exc_text = self.formatException(record.exc_info)
            if record.exc_text:
                exc_lines = [l.strip() for l in record.exc_text.replace("\r\n", "\n").replace("\r", "\n").split("\n") if l.strip()]
                clean_issue += " | Exception: " + " | ".join(exc_lines)

        levelname = record.levelname
        
        return (
            f"[{timestamp}] "
            f"[{levelname:<7}] "
            f"[Action: {action:<22}] "
            f"[Username: {username:<12}] "
            f"[Email: {email:<25}] - "
            f"Issue: {clean_issue}"
        )

formatter = StructuredLogFormatter()

# Add TimedRotatingFileHandler to rotate daily and retain 3 days of logs
if not any(isinstance(h, logging.FileHandler) for h in logger.handlers):
    file_handler = TimedRotatingFileHandler(
        LOG_FILE,
        when='D',
        interval=1,
        backupCount=3,
        encoding='utf-8'
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

# Add Stream (Console) Handler if not already added
if not any(isinstance(h, logging.StreamHandler) and not isinstance(h, logging.FileHandler) for h in logger.handlers):
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)


def cleanup_old_logs(retention_days: int = 3):
    """
    Purges log lines in backend.log and backup log files in the logs directory
    that are older than retention_days (default 3 days).
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=retention_days)

    # 1. Clean up old lines inside the active backend.log file
    if os.path.exists(LOG_FILE):
        try:
            with open(LOG_FILE, "r", encoding="utf-8") as f:
                lines = f.readlines()
            
            retained_lines = []
            for line in lines:
                match = re.match(r"^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) UTC\]", line)
                if match:
                    try:
                        log_dt = datetime.strptime(match.group(1), "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
                        if log_dt >= cutoff:
                            retained_lines.append(line)
                    except ValueError:
                        retained_lines.append(line)
                else:
                    retained_lines.append(line)
            
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                f.writelines(retained_lines)
        except Exception:
            pass

    # 2. Remove rotated backup log files older than retention_days
    try:
        cutoff_ts = cutoff.timestamp()
        for fname in os.listdir(LOG_DIR):
            fpath = os.path.join(LOG_DIR, fname)
            if os.path.isfile(fpath) and fname != "backend.log":
                if os.path.getmtime(fpath) < cutoff_ts:
                    try:
                        os.remove(fpath)
                    except OSError:
                        pass
    except Exception:
        pass


def log_event(level: str, action: str, issue: str, username: str = "N/A", email: str = "N/A"):
    """
    Logs backend events with timestamp, username, email, action, and explicit issue description.
    Persists to log file, outputs to console, and attempts database audit log recording.
    """
    username_clean = username if username else "N/A"
    email_clean = email if email else "N/A"
    
    # Sanitize issue parameter
    issue_str = str(issue) if issue else ""
    lines = [line.strip() for line in issue_str.replace("\r\n", "\n").replace("\r", "\n").split("\n") if line.strip()]
    clean_issue = " | ".join(lines) if lines else ""

    extra = {
        'username': username_clean,
        'email': email_clean,
        'action': action,
        'issue': clean_issue
    }
    
    lvl = level.upper()
    if lvl in ("ERROR", "CRITICAL"):
        logger.error(clean_issue, extra=extra)
    elif lvl in ("WARNING", "WARN"):
        logger.warning(clean_issue, extra=extra)
    elif lvl == "DEBUG":
        logger.debug(clean_issue, extra=extra)
    else:
        logger.info(clean_issue, extra=extra)
        
    # Non-blocking DB audit log save if DB is active
    try:
        from app.database.operations import create_audit_log
        create_audit_log(
            log_level=lvl,
            action=action,
            username=username_clean,
            email=email_clean,
            issue=clean_issue
        )
    except Exception:
        # DB log failure should never disrupt request flow
        pass


