"""Package the built portable app using Python's standard library."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

folder = Path(__file__).resolve().parent / "dist"
html = folder / "PCSWMM-results.html"
instructions = (
    "1. Extract this ZIP to a folder on your PC.\r\n"
    "2. Open PCSWMM-results.html with Chrome, Edge, or Firefox. Do not use a file preview.\r\n"
    "3. Click Try a sample batch to confirm the app runs (three rows with two report groups should appear).\r\n"
    "4. Choose one or more .rpt reports and paste your node IDs, then click Extract results.\r\n"
    "5. Export CSV to save your table. Liter volumes are converted to m3.\r\n"
    "Your .rpt file stays on your PC.\r\n"
)
with ZipFile(folder / "PCSWMM-results.zip", "w", ZIP_DEFLATED) as archive:
    archive.write(html, "PCSWMM-results.html")
    archive.writestr("START-HERE.txt", instructions)
with ZipFile(folder / "PCSWMM-results.zip") as archive:
    assert archive.testzip() is None
    assert archive.read("PCSWMM-results.html") == html.read_bytes()
print("Created and verified dist/PCSWMM-results.zip")
