param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\public\social-card.png')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outputFullPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = [System.IO.Path]::GetDirectoryName($outputFullPath)
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

$bitmap = [System.Drawing.Bitmap]::new(1200, 630)
$bitmap.SetResolution(96, 96)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Rectangle]::new(0, 0, 1200, 630),
  [System.Drawing.ColorTranslator]::FromHtml('#F8F9FB'),
  [System.Drawing.ColorTranslator]::FromHtml('#E5ECFF'),
  18
)
$graphics.FillRectangle($background, 0, 0, 1200, 630)

$primary = [System.Drawing.ColorTranslator]::FromHtml('#0053DD')
$primaryDark = [System.Drawing.ColorTranslator]::FromHtml('#003DA6')
$ink = [System.Drawing.ColorTranslator]::FromHtml('#20262B')
$muted = [System.Drawing.ColorTranslator]::FromHtml('#596168')
$white = [System.Drawing.Color]::White
$paleBlue = [System.Drawing.ColorTranslator]::FromHtml('#DDE7FF')

# Decorative arcs keep the card recognizably branded without distracting from copy.
$arcPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(32, $primary), 2)
for ($size = 240; $size -le 720; $size += 120) {
  $graphics.DrawEllipse($arcPen, 905 - ($size / 2), 315 - ($size / 2), $size, $size)
}

# Logo tile and simple house mark, derived from the existing favicon geometry.
$logoBrush = [System.Drawing.SolidBrush]::new($primary)
$graphics.FillEllipse($logoBrush, 72, 64, 74, 74)
$houseBrush = [System.Drawing.SolidBrush]::new($white)
$roof = [System.Drawing.Point[]]@(
  [System.Drawing.Point]::new(91, 98),
  [System.Drawing.Point]::new(109, 82),
  [System.Drawing.Point]::new(127, 98)
)
$graphics.FillPolygon($houseBrush, $roof)
$graphics.FillRectangle($houseBrush, 94, 96, 30, 25)
$doorBrush = [System.Drawing.SolidBrush]::new($primary)
$graphics.FillRectangle($doorBrush, 105, 107, 8, 14)

$brandFont = [System.Drawing.Font]::new('Segoe UI', 29, [System.Drawing.FontStyle]::Bold)
$headlineFont = [System.Drawing.Font]::new('Segoe UI', 57, [System.Drawing.FontStyle]::Bold)
$bodyFont = [System.Drawing.Font]::new('Segoe UI', 23, [System.Drawing.FontStyle]::Regular)
$labelFont = [System.Drawing.Font]::new('Segoe UI', 17, [System.Drawing.FontStyle]::Bold)
$urlFont = [System.Drawing.Font]::new('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
$inkBrush = [System.Drawing.SolidBrush]::new($ink)
$mutedBrush = [System.Drawing.SolidBrush]::new($muted)
$primaryBrush = [System.Drawing.SolidBrush]::new($primary)

$graphics.DrawString('Housing Navigator', $brandFont, $inkBrush, 166, 76)
$graphics.DrawString("Find housing help.`nTrack waitlists.", $headlineFont, $inkBrush, 72, 171)
$graphics.DrawString(
  'Verified local resources for the Portland-Vancouver metro.',
  $bodyFont,
  $mutedBrush,
  [System.Drawing.RectangleF]::new(76, 350, 660, 70)
)

# A compact resource card motif communicates the product without fake screenshots.
$cardBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(244, $white))
$cardBorder = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(45, $primary), 2)
$cardX = 830
$cardY = 148
foreach ($label in @('Rent assistance', 'Emergency shelter', 'Waitlist updates')) {
  $graphics.FillRectangle($cardBrush, $cardX, $cardY, 290, 82)
  $graphics.DrawRectangle($cardBorder, $cardX, $cardY, 290, 82)
  $graphics.FillEllipse($primaryBrush, $cardX + 22, $cardY + 25, 32, 32)
  $graphics.FillEllipse($houseBrush, $cardX + 32, $cardY + 35, 12, 12)
  $graphics.DrawString($label, $labelFont, $inkBrush, $cardX + 70, $cardY + 25)
  $cardY += 102
}

$pillBrush = [System.Drawing.SolidBrush]::new($paleBlue)
$graphics.FillRectangle($pillBrush, 72, 460, 455, 54)
$graphics.DrawString('No account needed to search', $labelFont, $primaryBrush, 94, 472)
$graphics.DrawString('housingnavigator.us', $urlFont, $primaryBrush, 76, 551)

$pngStream = [System.IO.MemoryStream]::new()
$bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
[System.IO.File]::WriteAllBytes($outputFullPath, $pngStream.ToArray())
$pngStream.Dispose()

$arcPen.Dispose()
$background.Dispose()
$logoBrush.Dispose()
$houseBrush.Dispose()
$doorBrush.Dispose()
$brandFont.Dispose()
$headlineFont.Dispose()
$bodyFont.Dispose()
$labelFont.Dispose()
$urlFont.Dispose()
$inkBrush.Dispose()
$mutedBrush.Dispose()
$primaryBrush.Dispose()
$cardBrush.Dispose()
$cardBorder.Dispose()
$pillBrush.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output "Generated $outputFullPath (1200x630)."
