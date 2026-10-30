import json
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from app.config import LAURAMAC_BASE_URL, LAURAMAC_USERNAME, LAURAMAC_PASSWORD
from app.logger import log_event


class LauramacError(Exception):
    """Base exception for Lauramac API errors."""
    pass


class LauramacAuthError(LauramacError):
    """Authentication failure with Lauramac."""
    pass


class LauramacAPIError(LauramacError):
    """Error returned by Lauramac loan data API."""
    pass


class LauramacService:
    def __init__(self):
        self._token: Optional[str] = None
        self._token_expires_at: float = 0.0  # Unix timestamp

    def authenticate(self, force: bool = False) -> str:
        """Authenticate with Lauramac and obtain a Bearer Token.

        Caches the token in-memory until expiration. Uses standard library
        urllib so no external dependencies are required.
        """
        now = time.time()
        # Re-use token if valid for at least 60 more seconds
        if not force and self._token and self._token_expires_at > (now + 60):
            return self._token

        if not LAURAMAC_USERNAME or not LAURAMAC_PASSWORD:
            raise LauramacAuthError(
                "Lauramac API credentials (LAURAMAC_USERNAME / LAURAMAC_PASSWORD) are not configured in .env"
            )

        auth_url = f"{LAURAMAC_BASE_URL}/login/authenticate"
        headers = {
            "username": LAURAMAC_USERNAME,
            "Content-Type": "application/json"
        }
        body = json.dumps({
            "username": LAURAMAC_USERNAME,
            "password": LAURAMAC_PASSWORD
        }).encode("utf-8")

        req = urllib.request.Request(auth_url, data=body, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                resp_bytes = resp.read()
                raw_text = resp_bytes.decode("utf-8", errors="replace")
                status_code = resp.status
        except urllib.error.HTTPError as e:
            raw_text = e.read().decode("utf-8", errors="replace")
            err_msg = raw_text[:300]
            try:
                err_json = json.loads(raw_text)
                err_msg = err_json.get("Message") or err_json.get("message") or err_msg
            except Exception:
                pass
            raise LauramacAuthError(f"Lauramac authentication failed ({e.code}): {err_msg}")
        except urllib.error.URLError as e:
            raise LauramacAuthError(f"Failed to connect to Lauramac authentication service: {e.reason}")
        except Exception as e:
            raise LauramacAuthError(f"Failed to connect to Lauramac authentication service: {str(e)}")

        if status_code != 200:
            raise LauramacAuthError(f"Lauramac authentication failed ({status_code}): {raw_text[:300]}")

        try:
            data = json.loads(raw_text)
        except Exception:
            raise LauramacAuthError("Invalid JSON returned by Lauramac authentication service.")

        token = data.get("Token")
        if not token:
            raise LauramacAuthError("Lauramac authentication succeeded but did not return a 'Token'.")

        self._token = token
        expiry_str = data.get("Token Expiry")
        parsed_expiry = None
        if expiry_str:
            for fmt in ("%m-%d-%Y %H:%M:%S", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S"):
                try:
                    dt = datetime.strptime(expiry_str, fmt)
                    parsed_expiry = dt.replace(tzinfo=timezone.utc).timestamp()
                    break
                except Exception:
                    pass

        if parsed_expiry and parsed_expiry > now:
            self._token_expires_at = parsed_expiry
        else:
            self._token_expires_at = now + (25 * 60)

        log_event("INFO", "LAURAMAC_AUTH_SUCCESS", f"Successfully authenticated with Lauramac API for user {LAURAMAC_USERNAME}")
        return self._token

    def fetch_loan_truedata(self, loan_id: str, seller_name: str) -> Dict[str, Any]:
        """Fetch True Data for a specific Loan ID and Seller Name from Lauramac API."""
        clean_loan_id = str(loan_id or "").strip()
        clean_seller_name = str(seller_name or "").strip()

        if not clean_loan_id:
            raise LauramacAPIError("Loan ID is required.")
        if not clean_seller_name:
            raise LauramacAPIError("Seller Name is required.")

        token = self.authenticate()
        loan_url = f"{LAURAMAC_BASE_URL}/apis/loan/truedata"

        def _make_call(bearer_token: str):
            headers = {
                "Authorization": f"Bearer {bearer_token}",
                "UserName": LAURAMAC_USERNAME,
                "LoanId": clean_loan_id,
                "SellerName": clean_seller_name
            }
            req = urllib.request.Request(loan_url, headers=headers, method="GET")
            with urllib.request.urlopen(req, timeout=20) as resp:
                resp_bytes = resp.read()
                return resp.status, resp_bytes.decode("utf-8", errors="replace")

        try:
            status_code, raw_text = _make_call(token)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                # Retry once with refreshed token
                try:
                    fresh_token = self.authenticate(force=True)
                    status_code, raw_text = _make_call(fresh_token)
                except Exception as retry_err:
                    raise LauramacAPIError(f"Lauramac authentication error on retry: {str(retry_err)}")
            else:
                raw_text = e.read().decode("utf-8", errors="replace")
                err_msg = raw_text[:300]
                try:
                    err_json = json.loads(raw_text)
                    err_msg = err_json.get("Message") or err_json.get("message") or err_msg
                except Exception:
                    pass
                raise LauramacAPIError(f"Lauramac API request failed ({e.code}): {err_msg}")
        except urllib.error.URLError as e:
            raise LauramacAPIError(f"Network error communicating with Lauramac API: {e.reason}")
        except Exception as e:
            raise LauramacAPIError(f"Network error communicating with Lauramac API: {str(e)}")

        if status_code != 200:
            raise LauramacAPIError(f"Lauramac API request failed ({status_code}): {raw_text[:300]}")

        try:
            data = json.loads(raw_text)
        except Exception:
            raise LauramacAPIError("Invalid JSON response returned by Lauramac API.")

        # Check for error payload like {"Error Code": ..., "Message": ...}
        if "Error Code" in data and not data.get("True Data"):
            err_msg = data.get("Message") or f"Error Code: {data.get('Error Code')}"
            raise LauramacAPIError(f"Lauramac API reported error: {err_msg}")

        true_data = data.get("True Data")
        if not true_data or not isinstance(true_data, dict):
            raise LauramacAPIError(
                f"No 'True Data' object found in Lauramac response for Loan ID '{clean_loan_id}' and Seller '{clean_seller_name}'."
            )

        if len(true_data) == 0:
            raise LauramacAPIError(
                f"'True Data' object is empty for Loan ID '{clean_loan_id}' and Seller '{clean_seller_name}'."
            )

        log_event(
            "INFO",
            "LAURAMAC_FETCH_SUCCESS",
            f"Retrieved {len(true_data)} fields from Lauramac for Loan ID: {clean_loan_id}, Seller: {clean_seller_name}"
        )
        return data


# Global singleton instance
lauramac_client = LauramacService()
