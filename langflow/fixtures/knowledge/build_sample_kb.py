"""Builds the sample knowledge-base PDF for a fictional business, used only to test Acta's Langflow flows.

Content is in Indonesian on purpose (approved exception): it mirrors what a real Indonesian business would upload,
and it exercises retrieval on Indonesian text. Some topics are intentionally absent so tests can check that the
reply flow admits missing knowledge instead of inventing it (e.g. Mandarin classes, weekend corporate classes).

Run: python langflow/fixtures/knowledge/build_sample_kb.py
"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

OUT = Path(__file__).with_name("aksara-academy-knowledge-base.pdf")
# Plain-text twin of the PDF, used by the eval runner to check that reply sources are real quotes.
TEXT_OUT = OUT.with_suffix(".txt")

# Each section is (heading, [paragraph or list of bullets, ...]). Headings stay short and specific so each
# chunk carries its own topic after splitting.
SECTIONS = [
    ("1. Profil Perusahaan", [
        "Aksara Academy adalah penyedia pelatihan bahasa Inggris dan komunikasi bisnis untuk perusahaan dan "
        "individu. Aksara Academy melayani perusahaan menengah dan besar yang ingin meningkatkan kemampuan "
        "bahasa Inggris karyawannya, serta individu yang menyiapkan tes IELTS.",
        ["Kantor: Jl. Wijaya Kusuma No. 18, Jakarta Selatan.",
         "Kelas tersedia offline di kantor klien (in-house), offline di kantor Aksara Academy, atau online melalui Zoom.",
         "WhatsApp admin: 0812-0000-1818. Instagram: @aksara.academy.id. Email: halo@aksara-academy.example."],
    ]),
    ("2. Jam Operasional", [
        ["Senin sampai Jumat: 08.00 sampai 17.00 WIB.",
         "Sabtu: 09.00 sampai 13.00 WIB, hanya untuk kelas individu.",
         "Minggu dan hari libur nasional: tutup. Pesan yang masuk dibalas pada hari kerja berikutnya."],
    ]),
    ("3. Layanan Korporat: Corporate English Class", [
        "Kelas bahasa Inggris untuk karyawan dengan materi yang disesuaikan dengan bidang kerja perusahaan.",
        ["Harga dasar berlaku untuk 10 peserta per batch.",
         "Program terdiri dari 24 sesi, masing-masing 90 menit, dua kali seminggu.",
         "Harga: Rp 12.000.000 per batch (10 peserta), sudah termasuk placement test, materi, dan sertifikat.",
         "Peserta tambahan: Rp 1.100.000 per orang, maksimal 12 peserta per batch.",
         "Untuk lebih dari 12 peserta, perusahaan dibagi menjadi beberapa batch."],
    ]),
    ("4. Layanan Korporat: Business Communication and Presentation", [
        "Pelatihan presentasi, rapat, negosiasi, dan penulisan email bisnis dalam bahasa Inggris.",
        ["Maksimal 10 peserta per batch, 12 sesi masing-masing 120 menit.",
         "Harga: Rp 15.000.000 per batch."],
    ]),
    ("5. Layanan Korporat: TOEIC Preparation dan In-house Custom Training", [
        ["TOEIC Preparation: 16 sesi, maksimal 10 peserta, Rp 9.500.000 per batch, sudah termasuk satu simulasi TOEIC.",
         "In-house Custom Training: program yang dirancang khusus sesuai kebutuhan perusahaan. Harga berdasarkan "
         "penawaran (quotation) setelah sesi konsultasi dan analisis kebutuhan."],
    ]),
    ("6. Layanan Individu", [
        ["IELTS Private: 8 sesi per bulan, masing-masing 90 menit, Rp 3.500.000 per bulan. Jadwal fleksibel, "
         "termasuk Sabtu.",
         "IELTS Group Class: maksimal 6 peserta, 12 sesi, Rp 2.800.000 per program.",
         "General English Private: 8 sesi per bulan, Rp 2.400.000 per bulan.",
         "Semua kelas individu dibayar di muka sebelum sesi pertama."],
    ]),
    ("7. Proses Kerja Sama Korporat", [
        ["Langkah 1: Konsultasi gratis 60 menit, online atau di kantor klien.",
         "Langkah 2: Analisis kebutuhan dan placement test untuk calon peserta.",
         "Langkah 3: Aksara Academy mengirim proposal dan penawaran harga paling lambat 3 hari kerja setelah konsultasi.",
         "Langkah 4: Perusahaan menerbitkan purchase order (PO) atau menandatangani kontrak.",
         "Langkah 5: Kelas dapat dimulai paling cepat 7 hari kerja setelah PO diterima."],
    ]),
    ("8. Menjadwalkan Konsultasi", [
        "Konsultasi korporat tersedia Senin sampai Jumat pukul 09.00 sampai 16.00 WIB. Untuk menjadwalkan "
        "konsultasi, admin memerlukan data berikut:",
        ["Nama dan jabatan kontak.",
         "Nama perusahaan.",
         "Perkiraan jumlah peserta.",
         "Tujuan pelatihan, misalnya presentasi ke klien asing atau persiapan TOEIC.",
         "Pilihan tanggal dan jam, serta format online atau offline."],
    ]),
    ("9. Pembayaran", [
        ["Korporat: pembayaran dua termin, 50% setelah PO dan 50% di pertengahan program. Invoice jatuh tempo 14 hari.",
         "Individu: dibayar penuh di muka.",
         "Metode pembayaran: transfer bank ke rekening perusahaan. Aksara Academy tidak menerima pembayaran tunai."],
    ]),
    ("10. Diskon Resmi", [
        "Hanya diskon berikut yang berlaku. Admin tidak boleh menjanjikan diskon lain tanpa persetujuan manajer.",
        ["Diskon 5% untuk korporat yang melunasi seluruh program di awal.",
         "Diskon 10% untuk korporat yang mengambil 3 batch atau lebih sekaligus."],
    ]),
    ("11. Reschedule dan Pembatalan", [
        ["Peserta dapat menjadwal ulang sesi paling lambat 24 jam sebelum jadwal. Kurang dari 24 jam, sesi dianggap hangus.",
         "Jika tutor tidak hadir tanpa pemberitahuan, peserta mendapat sesi pengganti ditambah satu sesi gratis sebagai kompensasi.",
         "Pembatalan program oleh klien sebelum kelas dimulai dikenakan biaya administrasi 10%."],
    ]),
    ("12. Refund", [
        ["Refund diberikan secara prorata untuk sesi yang belum berjalan.",
         "Permintaan refund diajukan ke tim customer support dan diproses paling lambat 14 hari kerja.",
         "Admin chat tidak boleh menyetujui refund sendiri; semua refund harus melalui tim customer support."],
    ]),
    ("13. Pertanyaan yang Sering Diajukan", [
        ["Apakah ada sertifikat? Ya, peserta dengan kehadiran minimal 80% mendapat sertifikat.",
         "Apakah tutornya native speaker? Tutor Aksara Academy adalah pengajar Indonesia bersertifikat CELTA atau TESOL.",
         "Berapa minimum peserta kelas korporat? Minimum 4 peserta per batch; harga tetap dihitung per batch.",
         "Apakah materi bisa disesuaikan? Ya, materi Corporate English Class disesuaikan dengan bidang kerja perusahaan."],
    ]),
    ("14. Hal yang Harus Diteruskan ke Tim", [
        "Admin chat harus meneruskan hal berikut ke tim terkait dan tidak menjawab sendiri:",
        ["Permintaan harga khusus di luar daftar harga dan diskon resmi, diteruskan ke tim sales.",
         "Komplain dan permintaan refund, diteruskan ke tim customer support.",
         "Pertanyaan tentang layanan yang tidak tercantum di dokumen ini."],
    ]),
]


def build() -> None:
    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=10.5, leading=15)
    heading = ParagraphStyle("heading", parent=styles["Heading2"], textColor=colors.HexColor("#1f3a5f"), spaceBefore=10)
    bullet = ParagraphStyle("bullet", parent=body, leftIndent=14, firstLineIndent=-8)
    note = ParagraphStyle("note", parent=body, textColor=colors.HexColor("#8a1c1c"), fontSize=9.5)

    story = [
        Paragraph("Aksara Academy: Panduan Layanan dan Kebijakan", styles["Title"]),
        Paragraph("Dokumen contoh FIKTIF untuk pengujian Acta. Nama, harga, dan kontak tidak nyata.", note),
        Spacer(1, 0.4 * cm),
    ]
    for title, blocks in SECTIONS:
        story.append(Paragraph(title, heading))
        for block in blocks:
            if isinstance(block, list):
                # Plain hyphen bullets: they extract cleanly as text, unlike bullet glyphs.
                story.extend(Paragraph(f"- {b}", bullet) for b in block)
            else:
                story.append(Paragraph(block, body))
            story.append(Spacer(1, 0.15 * cm))

    doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm,
                            bottomMargin=2 * cm, title="Aksara Academy Knowledge Base (fictional)", author="Acta test fixture")
    doc.build(story)
    lines = []
    for title, blocks in SECTIONS:
        lines.append(title)
        for block in blocks:
            if isinstance(block, list):
                lines.extend(f"- {b}" for b in block)
            else:
                lines.append(block)
    TEXT_OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUT} and {TEXT_OUT.name}")


if __name__ == "__main__":
    build()
