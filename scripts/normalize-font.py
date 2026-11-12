import io
import sys
from fontTools.ttLib import TTFont


def normalize(data):
    font = TTFont(io.BytesIO(data), recalcTimestamp=False)
    # These optional vertical metrics are rejected by Chromium in some TTFs.
    if "vhea" in font and font["vhea"].tableVersion not in (0x10000, 0x11000):
        for table in ("vhea", "vmtx"):
            if table in font:
                del font[table]
    font.flavor = "woff2"
    output = io.BytesIO()
    font.save(output)
    return output.getvalue()


if __name__ == "__main__":
    sys.stdout.buffer.write(normalize(sys.stdin.buffer.read()))
