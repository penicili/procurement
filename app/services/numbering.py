from datetime import date

from ..extensions import db
from ..models import DocumentSequence

PREFIX = {
    "PR": "PR",
    "RFQ": "RFQ",
    "QT": "QT",
    "PO": "PO",
    "GRN": "GRN",
    "INV": "INV",
}


def next_number(doc_type: str, when: date | None = None) -> str:
    """Nomor dokumen: TYPE/YYYY/MM/NNNN, counter per tipe per bulan.

    Unik dijaga oleh constraint (doc_type, period). SQLite menjalankan satu writer
    pada satu waktu sehingga aman untuk skenario aplikasi ini.
    """
    if doc_type not in PREFIX:
        raise ValueError(f"Jenis dokumen tidak dikenal: {doc_type}")
    when = when or date.today()
    period = when.strftime("%Y-%m")
    seq = DocumentSequence.query.filter_by(doc_type=doc_type, period=period).one_or_none()
    if seq is None:
        seq = DocumentSequence(doc_type=doc_type, period=period, last_number=0)
        db.session.add(seq)
        db.session.flush()
    seq.last_number += 1
    db.session.flush()
    return f"{PREFIX[doc_type]}/{when.strftime('%Y/%m')}/{seq.last_number:04d}"
