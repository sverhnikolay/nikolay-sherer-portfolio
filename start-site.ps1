param(
  [int]$Port = 4173
)

$siteRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")

try {
  $listener.Start()
  Write-Host "Сайт запущен: http://localhost:$Port" -ForegroundColor Green
  Write-Host "Чтобы остановить сервер, нажмите Ctrl+C." -ForegroundColor DarkGray
  Start-Process "http://localhost:$Port"

  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $relativePath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = 'index.html' }

    $relativePath = $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $requestedPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($siteRoot, $relativePath))

    if (-not $requestedPath.StartsWith($siteRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      $context.Response.StatusCode = 403
      $context.Response.Close()
      continue
    }

    if (-not [System.IO.File]::Exists($requestedPath)) {
      $context.Response.StatusCode = 404
      $context.Response.Close()
      continue
    }

    $contentTypes = @{
      '.html' = 'text/html; charset=utf-8'
      '.css'  = 'text/css; charset=utf-8'
      '.js'   = 'text/javascript; charset=utf-8'
      '.png'  = 'image/png'
      '.jpg'  = 'image/jpeg'
      '.jpeg' = 'image/jpeg'
      '.svg'  = 'image/svg+xml'
      '.webp' = 'image/webp'
      '.ico'  = 'image/x-icon'
    }

    $extension = [System.IO.Path]::GetExtension($requestedPath).ToLowerInvariant()
    $contentType = $contentTypes[$extension]
    if (-not $contentType) { $contentType = 'application/octet-stream' }

    $bytes = [System.IO.File]::ReadAllBytes($requestedPath)
    $context.Response.StatusCode = 200
    $context.Response.ContentType = $contentType
    $context.Response.ContentLength64 = $bytes.Length
    $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $context.Response.Close()
  }
}
finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}

