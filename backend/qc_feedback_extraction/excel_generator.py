"""
Excel Generator Module for QC Feedback Reporting.
Builds an institutional, formatted multi-sheet Excel report from extracted QC email feedback.
"""

from datetime import datetime
from pathlib import Path
from typing import List

try:
    from .extractor import EmailMessageData
except ImportError:
    from extractor import EmailMessageData

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False


class QCExcelReportGenerator:
    """Generates standardized QC Feedback Excel workbooks."""

    HEADER_FILL = "1E3A8A"        # Deep Navy
    HEADER_FONT_COLOR = "FFFFFF"
    ZEBRA_FILL = "F8FAFC"         # Soft slate
    WHITE_FILL = "FFFFFF"
    BORDER_COLOR = "CBD5E1"

    # Status Highlights
    PASS_FILL = "DCFCE7"          # Soft Green
    PASS_FONT = "166534"
    FAIL_FILL = "FEE2E2"          # Soft Red
    FAIL_FONT = "991B1B"
    WARN_FILL = "FEF9C3"          # Soft Yellow
    WARN_FONT = "854D0E"

    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate_report(self, emails_data: List[EmailMessageData], filename_prefix: str = "QC_Feedback_Report") -> Path:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = self.output_dir / f"{filename_prefix}_{timestamp}.xlsx"

        if not HAS_OPENPYXL:
            return self._generate_fallback_csv(emails_data, filename_prefix, timestamp)

        wb = openpyxl.Workbook()
        wb.remove(wb.active)

        self._build_summary_sheet(wb, emails_data)
        self._build_details_sheet(wb, emails_data)
        self._build_audit_sheet(wb, emails_data)

        wb.save(output_file)
        print(f"[ExcelGenerator] QC Feedback Excel report created: {output_file}")
        return output_file

    def _build_summary_sheet(self, wb: "openpyxl.Workbook", emails_data: List[EmailMessageData]):
        ws = wb.create_sheet(title="QC Feedback Summary")
        ws.views.sheetView[0].showGridLines = True

        # Title Banner
        ws.merge_cells("A1:N1")
        title_cell = ws["A1"]
        title_cell.value = "TRUE DATA QC - EXECUTIVE FEEDBACK EXTRACTION REPORT"
        title_cell.font = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
        title_cell.fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
        title_cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 34

        # Metadata Row
        ws.merge_cells("A2:N2")
        meta_cell = ws["A2"]
        meta_cell.value = f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  |  Total Feedback Emails: {len(emails_data)}"
        meta_cell.font = Font(name="Calibri", size=10, italic=True, color="475569")
        meta_cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[2].height = 20

        ws.row_dimensions[3].height = 10

        headers = [
            "S.No",
            "Received Date",
            "Loan ID",
            "Borrower Name",
            "QC Analyst / Auditor",
            "Audit / Review Type",
            "QC Status",
            "Defect / Error Category",
            "Expected Value",
            "Actual Value",
            "Observations & Feedback",
            "Action Required",
            "Email Subject",
            "Sender Email",
        ]

        header_row = 4
        ws.row_dimensions[header_row].height = 26
        header_font = Font(name="Calibri", size=11, bold=True, color=self.HEADER_FONT_COLOR)
        header_fill = PatternFill(start_color=self.HEADER_FILL, end_color=self.HEADER_FILL, fill_type="solid")
        thin_border = Border(
            left=Side(style="thin", color=self.BORDER_COLOR),
            right=Side(style="thin", color=self.BORDER_COLOR),
            top=Side(style="thin", color=self.BORDER_COLOR),
            bottom=Side(style="thin", color=self.BORDER_COLOR)
        )

        for col_idx, h in enumerate(headers, start=1):
            cell = ws.cell(row=header_row, column=col_idx, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = thin_border

        current_row = header_row + 1
        for idx, item in enumerate(emails_data, start=1):
            ws.row_dimensions[current_row].height = 22
            date_str = item.date.strftime("%Y-%m-%d %H:%M") if item.date else ""

            row_values = [
                idx,
                date_str,
                item.loan_id or "N/A",
                item.borrower_name or "N/A",
                item.qc_analyst or "N/A",
                item.audit_type,
                item.qc_status,
                item.defect_category or "General",
                item.expected_value or "-",
                item.actual_value or "-",
                item.observations,
                item.action_required or "Review & Update",
                item.subject,
                item.sender
            ]

            is_even = (idx % 2 == 0)
            base_fill = PatternFill(
                start_color=self.ZEBRA_FILL if is_even else self.WHITE_FILL,
                end_color=self.ZEBRA_FILL if is_even else self.WHITE_FILL,
                fill_type="solid"
            )

            for col_idx, val in enumerate(row_values, start=1):
                cell = ws.cell(row=current_row, column=col_idx, value=val)
                cell.font = Font(name="Calibri", size=10)
                cell.fill = base_fill
                cell.border = thin_border

                if col_idx in (1, 2, 3, 6, 7):
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=(col_idx in (11, 12, 13)))

                # Status Highlight (Col 7: QC Status)
                if col_idx == 7:
                    st_low = str(val).lower()
                    if any(w in st_low for w in ("fail", "defect", "discrepancy", "rejected")):
                        cell.fill = PatternFill(start_color=self.FAIL_FILL, end_color=self.FAIL_FILL, fill_type="solid")
                        cell.font = Font(name="Calibri", size=10, bold=True, color=self.FAIL_FONT)
                    elif any(w in st_low for w in ("pass", "cleared", "approved", "verified")):
                        cell.fill = PatternFill(start_color=self.PASS_FILL, end_color=self.PASS_FILL, fill_type="solid")
                        cell.font = Font(name="Calibri", size=10, bold=True, color=self.PASS_FONT)
                    elif any(w in st_low for w in ("action", "pending", "needed", "correction")):
                        cell.fill = PatternFill(start_color=self.WARN_FILL, end_color=self.WARN_FILL, fill_type="solid")
                        cell.font = Font(name="Calibri", size=10, bold=True, color=self.WARN_FONT)

            current_row += 1

        self._autofit_columns(ws, min_width=12, max_width=45)

    def _build_details_sheet(self, wb: "openpyxl.Workbook", emails_data: List[EmailMessageData]):
        ws = wb.create_sheet(title="QC Detailed Findings")
        ws.views.sheetView[0].showGridLines = True

        headers = [
            "Item #", "Loan ID", "Field / Document Name", "Expected Value",
            "Actual Value", "Discrepancy / Remarks", "Finding Status", "Source Email Subject", "Source Date"
        ]

        ws.row_dimensions[1].height = 26
        header_font = Font(name="Calibri", size=10, bold=True, color=self.HEADER_FONT_COLOR)
        header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        thin_border = Border(
            left=Side(style="thin", color=self.BORDER_COLOR),
            right=Side(style="thin", color=self.BORDER_COLOR),
            top=Side(style="thin", color=self.BORDER_COLOR),
            bottom=Side(style="thin", color=self.BORDER_COLOR)
        )

        for col_idx, h in enumerate(headers, start=1):
            cell = ws.cell(row=1, column=col_idx, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = thin_border

        current_row = 2
        global_idx = 1
        for msg in emails_data:
            date_str = msg.date.strftime("%Y-%m-%d %H:%M") if msg.date else ""
            if msg.detailed_items:
                for d_item in msg.detailed_items:
                    ws.row_dimensions[current_row].height = 20
                    row_vals = [
                        global_idx,
                        d_item.get("loan_id") or msg.loan_id or "N/A",
                        d_item.get("field_name", ""),
                        d_item.get("expected_value", "-"),
                        d_item.get("actual_value", "-"),
                        d_item.get("remarks", ""),
                        d_item.get("status", msg.qc_status),
                        msg.subject,
                        date_str
                    ]
                    for c_idx, v in enumerate(row_vals, start=1):
                        c = ws.cell(row=current_row, column=c_idx, value=v)
                        c.font = Font(name="Calibri", size=10)
                        c.border = thin_border
                        if c_idx in (1, 2, 7, 9):
                            c.alignment = Alignment(horizontal="center", vertical="center")
                        else:
                            c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
                    current_row += 1
                    global_idx += 1
            else:
                ws.row_dimensions[current_row].height = 20
                row_vals = [
                    global_idx,
                    msg.loan_id or "N/A",
                    "General QC Feedback",
                    msg.expected_value or "-",
                    msg.actual_value or "-",
                    msg.observations,
                    msg.qc_status,
                    msg.subject,
                    date_str
                ]
                for c_idx, v in enumerate(row_vals, start=1):
                    c = ws.cell(row=current_row, column=c_idx, value=v)
                    c.font = Font(name="Calibri", size=10)
                    c.border = thin_border
                    if c_idx in (1, 2, 7, 9):
                        c.alignment = Alignment(horizontal="center", vertical="center")
                    else:
                        c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
                current_row += 1
                global_idx += 1

        self._autofit_columns(ws, min_width=12, max_width=45)

    def _build_audit_sheet(self, wb: "openpyxl.Workbook", emails_data: List[EmailMessageData]):
        ws = wb.create_sheet(title="Email Audit Log")
        ws.views.sheetView[0].showGridLines = True

        headers = ["#", "Date", "Sender", "Subject", "Loan ID", "Cleaned Body Content"]
        ws.row_dimensions[1].height = 24
        header_font = Font(name="Calibri", size=10, bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="334155", end_color="334155", fill_type="solid")
        thin_border = Border(
            left=Side(style="thin", color=self.BORDER_COLOR),
            right=Side(style="thin", color=self.BORDER_COLOR),
            top=Side(style="thin", color=self.BORDER_COLOR),
            bottom=Side(style="thin", color=self.BORDER_COLOR)
        )

        for col_idx, h in enumerate(headers, start=1):
            cell = ws.cell(row=1, column=col_idx, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = thin_border

        for idx, item in enumerate(emails_data, start=1):
            ws.row_dimensions[idx + 1].height = 20
            date_str = item.date.strftime("%Y-%m-%d %H:%M") if item.date else ""
            row_vals = [
                idx,
                date_str,
                item.sender,
                item.subject,
                item.loan_id or "N/A",
                item.cleaned_body[:1000]
            ]
            for col_idx, v in enumerate(row_vals, start=1):
                c = ws.cell(row=idx + 1, column=col_idx, value=v)
                c.font = Font(name="Calibri", size=9)
                c.border = thin_border
                if col_idx in (1, 2, 5):
                    c.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    c.alignment = Alignment(horizontal="left", vertical="center")

        self._autofit_columns(ws, min_width=10, max_width=50)

    def _autofit_columns(self, ws, min_width: int = 12, max_width: int = 50):
        for col in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col[0].column)
            for cell in col:
                val = str(cell.value or "")
                if len(val) > max_len and cell.row > 2:
                    max_len = len(val)
            adjusted_width = max(min_width, min(max_len + 3, max_width))
            ws.column_dimensions[col_letter].width = adjusted_width

    def _generate_fallback_csv(self, emails_data: List[EmailMessageData], prefix: str, timestamp: str) -> Path:
        import csv
        output_file = self.output_dir / f"{prefix}_{timestamp}.csv"
        headers = [
            "S.No", "Received Date", "Loan ID", "Borrower Name", "QC Analyst",
            "Audit Type", "QC Status", "Defect Category", "Observations", "Action Required", "Subject", "Sender"
        ]
        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(headers)
            for idx, item in enumerate(emails_data, start=1):
                writer.writerow([
                    idx,
                    item.date.strftime("%Y-%m-%d %H:%M") if item.date else "",
                    item.loan_id,
                    item.borrower_name,
                    item.qc_analyst,
                    item.audit_type,
                    item.qc_status,
                    item.defect_category,
                    item.observations,
                    item.action_required,
                    item.subject,
                    item.sender
                ])
        print(f"[ExcelGenerator] Structured CSV created: {output_file}")
        return output_file
