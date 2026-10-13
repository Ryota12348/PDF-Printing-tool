function getCurrentDateTime() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

// ローカルに配置した TTF ファイルを読み込む関数
async function addJapaneseFont(doc) {
    try {
        const response = await fetch('NotoSansJP-Light.ttf');
        if (!response.ok) {
            throw new Error('NotoSansJP-Light.ttf が見つかりません。同じフォルダに配置してください。');
        }
        const fontBlob = await response.blob();
        
        const reader = new FileReader();
        const base64Font = await new Promise((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(fontBlob);
        });

        doc.addFileToVFS("NotoSansJP-Light.ttf", base64Font);
        doc.addFont("NotoSansJP-Light.ttf", "NotoSansJP", "normal");
    } catch (e) {
        console.error(e);
        alert("⚠️ フォントファイル 'NotoSansJP-Light.ttf' の読み込みに失敗しました。HTMLと同じフォルダに配置されているか確認してください。");
    }
}

document.getElementById('generateBtn').addEventListener('click', async () => {
    const { jsPDF } = window.jspdf;
    const { PDFDocument } = PDFLib;

    const title = document.getElementById('titleInput').value.trim() || '無題';
    const dateMode = document.querySelector('input[name="dateMode"]:checked').value;
    const showDate = (dateMode === 'yes');
    const memoText = document.getElementById('memoInput').value;
    const orderMode = document.querySelector('input[name="orderMode"]:checked').value;
    const pdfFileInput = document.getElementById('pdfFileInput');

    // --- ステップ 1: jsPDF で表紙の PDF バイナリを作成 ---
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    // ローカルの日本語フォントを適用
    await addJapaneseFont(doc);
    doc.setFont("NotoSansJP");

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // ── 表紙のデザイン配置（上部に移動 ＆ メモを左揃え） ──
    let currentY = 50; // 上部からの余白を小さくして全体を上に配置

    // 1. タイトル（中央揃え）
    doc.setFontSize(26);
    const titleLines = doc.splitTextToSize(title, pageWidth - 60);
    doc.text(titleLines, pageWidth / 2, currentY, { align: 'center' });
    
    currentY += (titleLines.length * 12) + 6;

    // 2. 日付（「記入する」の場合のみ・中央揃え）
    if (showDate) {
        doc.setFontSize(11);
        doc.setTextColor(100, 100, 100);
        doc.text(`作成日時: ${getCurrentDateTime()}`, pageWidth / 2, currentY, { align: 'center' });
        currentY += 15;
    }

    // 3. メモ（左揃え、余白を広めにとって大量に書けるように配置）
    if (memoText.trim() !== "") {
        currentY += 10; // タイトル・日付の下から少し離す
        const leftMargin = 30; // 左側の余白
        const maxLineWidth = pageWidth - (leftMargin * 2);
        
        doc.setFontSize(11);
        doc.setTextColor(60, 60, 60);
        
        const rawLines = memoText.split('\n');
        const lineSpacing = 7;

        rawLines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                currentY += 4; // 空行
                return;
            }
            let drawText = trimmed;
            let fontSize = 11;

            if (trimmed.startsWith('#')) {
                const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
                if (match) {
                    drawText = match[2];
                    fontSize = match[1].length === 1 ? 14 : 12;
                }
            } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                drawText = '• ' + trimmed.substring(2).trim();
            }
            drawText = drawText.replace(/\*\*(.*?)\*\*/g, '$1');

            doc.setFontSize(fontSize);
            
            // 長い文章が折り返せるように幅を制限しつつ左揃えで出力
            const wrappedLines = doc.splitTextToSize(drawText, maxLineWidth);
            wrappedLines.forEach(wLine => {
                doc.text(wLine, leftMargin, currentY, { align: 'left' });
                currentY += lineSpacing;
            });
        });
    }

    const coverPdfBytes = doc.output('arraybuffer');

    // --- ステップ 2: pdf-lib を使ってPDFを組み立てる ---
    try {
        const mergedPdf = await PDFDocument.create();
        
        const coverPdfDoc = await PDFDocument.load(coverPdfBytes);
        const [coverPage] = await mergedPdf.copyPages(coverPdfDoc, [0]);

        let mainPages = [];
        let originalPageCount = 0;

        if (pdfFileInput.files.length > 0) {
            const file = pdfFileInput.files[0];
            const arrayBuffer = await file.arrayBuffer();
            const sourcePdfDoc = await PDFDocument.load(arrayBuffer);
            originalPageCount = sourcePdfDoc.getPageCount();
            
            let indices = Array.from({ length: originalPageCount }, (_, i) => i);
            if (orderMode === 'reverse') {
                indices = indices.reverse();
            }

            mainPages = await mergedPdf.copyPages(sourcePdfDoc, indices);
        }

        const coverPageCount = 1;
        const contentTotal = originalPageCount + coverPageCount;
        let blankPagesCount = 0;
        
        if (orderMode === 'reverse' && originalPageCount > 0) {
            const remainder = contentTotal % 4;
            blankPagesCount = (4 - remainder) % 4;
        }

        const a4Width = 595.28;
        const a4Height = 841.89;

        if (orderMode === 'reverse') {
            for (let i = 0; i < blankPagesCount; i++) {
                mergedPdf.addPage([a4Width, a4Height]);
            }
            for (const page of mainPages) {
                mergedPdf.addPage(page);
            }
            mergedPdf.addPage(coverPage);
        } else {
            mergedPdf.addPage(coverPage);
            for (const page of mainPages) {
                mergedPdf.addPage(page);
            }
        }

        // --- ステップ 3: ダウンロード ---
        const mergedPdfBytes = await mergedPdf.save();
        const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        
        const safeTitle = title.replace(/[/\\?%*:|"<>]/g, '_');
        link.download = `${safeTitle}_processed.pdf`;
        link.click();

        const totalPages = mergedPdf.getPageCount();
        if (orderMode === 'reverse' && originalPageCount > 0) {
            alert(`✅ 処理完了（逆順・4の倍数調整）\n(空白: ${blankPagesCount}P + 本文: ${originalPageCount}P + 表紙: 1P = 計 ${totalPages}P)`);
        } else {
            alert(`✅ 処理完了（そのまま）\n(表紙: 1P + 本文: ${originalPageCount}P = 計 ${totalPages}P)`);
        }

    } catch (error) {
        console.error(error);
        alert("⚠️ PDFの処理中にエラーが発生しました。コンソールを確認してください。");
    }
});
