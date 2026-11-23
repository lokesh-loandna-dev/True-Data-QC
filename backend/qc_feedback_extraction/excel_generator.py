"""
Excel Generator Module for QC Feedback Reporting.
Replicates the exact format and color styling from the requirement screenshot:
- Header: Light Lavender Blue (#C6D9F1)
- Example column: Brown fill (#543824), bold white text, vertically merged
- Date Received column: Dark fill (#1F1F1F), white text, vertically merged
- Loan Number column: Dark fill (#1F1F1F), white text, repeated per item
- QC Feedback column: Dark fill (#1F1F1F), white text, wrap text
- Crisp white grid borders (#FFFFFF)
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
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False


class QCExcelReportGenerator:
    """Generates the exact QC Feedback Excel report with vertical merging and dark-card theme."""

    HEADER_BG = "C6D9F1"         # Light Lavender / Ice Blue
    EXAMPLE_BG = "543824"        # Dark Brown / Bronze
    DATA_DARK_BG = "1F1F1F"      # Dark Charcoal / Black
    BORDER_WHITE = "FFFFFF"      # Crisp White Borders

    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate_report(self, emails_data: List[EmailMessageData], filename_prefix: str = "QC_Feedback_Report") -> Path:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = self.output_dir / f"{filename_prefix}_{timestamp}.xlsx"

        if not HAS_OPENPYXL:
            return self._generate_fallback_csv(emails_data, filename_prefix, timestamp)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "QC Feedback"
        ws.views.sheetView[0].showGridLines = True

        headers = ["Example", "Date Received", "Loan Number", "QC Feedback"]

        # Style Definitions
        header_font = Font(name="Calibri", size=11, bold=True, color="000000")
        header_fill = PatternFill(start_color=self.HEADER_BG, end_color=self.HEADER_BG, fill_type="solid")

        example_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        example_fill = PatternFill(start_color=self.EXAMPLE_BG, end_color=self.EXAMPLE_BG, fill_type="solid")

        data_font = Font(name="Calibri", size=10, color="FFFFFF")
        data_fill = PatternFill(start_color=self.DATA_DARK_BG, end_color=self.DATA_DARK_BG, fill_type="solid")

        white_border = Border(
            left=Side(style="thin", color=self.BORDER_WHITE),
            right=Side(style="thin", color=self.BORDER_WHITE),
            top=Side(style="thin", color=self.BORDER_WHITE),
            bottom=Side(style="thin", color=self.BORDER_WHITE)
        )

        # 1. Header Row
        ws.row_dimensions[1].height = 26
        for col_idx, h in enumerate(headers, start=1):
            cell = ws.cell(row=1, column=col_idx, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = white_border

        # 2. Populate Data Rows
        current_row = 2
        for loan_idx, item in enumerate(emails_data, start=1):
            loan_label = f"Loan#{loan_idx}"
            date_str = f"{item.date.month}/{item.date.day}/{item.date.year}" if item.date else ""
            loan_num = str(item.loan_id or "")

            feedback_list = item.feedback_items if item.feedback_items else ["No Feedback"]
            num_items = len(feedback_list)
            start_row = current_row
            end_row = current_row + num_items - 1

            for item_idx, feedback_text in enumerate(feedback_list):
                ws.row_dimensions[current_row].height = 26

                # Col 1: Example
                c1 = ws.cell(row=current_row, column=1, value=loan_label if item_idx == 0 else "")
                c1.font = example_font
                c1.fill = example_fill
                c1.border = white_border
                c1.alignment = Alignment(horizontal="center", vertical="center")

                # Col 2: Date Received
                c2 = ws.cell(row=current_row, column=2, value=date_str if item_idx == 0 else "")
                c2.font = data_font
                c2.fill = data_fill
                c2.border = white_border
                c2.alignment = Alignment(horizontal="center", vertical="center")

                # Col 3: Loan Number (Repeated per item)
                c3 = ws.cell(row=current_row, column=3, value=loan_num)
                c3.font = data_font
                c3.fill = data_fill
                c3.border = white_border
                c3.number_format = "@"
                c3.alignment = Alignment(horizontal="center", vertical="center")

                # Col 4: QC Feedback
                c4 = ws.cell(row=current_row, column=4, value=feedback_text)
                c4.font = data_font
                c4.fill = data_fill
                c4.border = white_border
                if feedback_text.strip().lower() == "no feedback":
                    c4.alignment = Alignment(horizontal="center", vertical="center")
                else:
                    c4.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)

                current_row += 1

            # Vertically merge Example and Date Received columns if multiple feedback rows exist
            if num_items > 1:
                ws.merge_cells(start_row=start_row, start_column=1, end_row=end_row, end_column=1)
                ws.merge_cells(start_row=start_row, start_column=2, end_row=end_row, end_column=2)

        # 3. Column Widths
        ws.column_dimensions["A"].width = 14
        ws.column_dimensions["B"].width = 16
        ws.column_dimensions["C"].width = 20
        ws.column_dimensions["D"].width = 95

        wb.save(output_file)
        print(f"[ExcelGenerator] QC Feedback Excel report created: {output_file}")
        return output_file

    def _generate_fallback_csv(self, emails_data: List[EmailMessageData], prefix: str, timestamp: str) -> Path:
        import csv
        output_file = self.output_dir / f"{prefix}_{timestamp}.csv"
        headers = ["Example", "Date Received", "Loan Number", "QC Feedback"]

        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(headers)

            for loan_idx, item in enumerate(emails_data, start=1):
                loan_label = f"Loan#{loan_idx}"
                date_str = f"{item.date.month}/{item.date.day}/{item.date.year}" if item.date else ""
                loan_num = str(item.loan_id or "")

                feedback_list = item.feedback_items if item.feedback_items else ["No Feedback"]

                for item_idx, feedback_text in enumerate(feedback_list):
                    ex_val = loan_label if item_idx == 0 else ""
                    dt_val = date_str if item_idx == 0 else ""
                    writer.writerow([ex_val, dt_val, loan_num, feedback_text])

        print(f"[ExcelGenerator] Structured CSV created: {output_file}")
        return output_file
