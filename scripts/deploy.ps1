param(
  [string]$Server = '135.106.228.32',
  [string]$Key = 'C:\Users\shere\.ssh\nikolay_portfolio_deploy'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
  if (git status --porcelain) { throw 'Сначала сохраните изменения коммитом.' }
  $release = (git rev-parse HEAD).Trim()
  if ($release -notmatch '^[0-9a-f]{40}$') { throw 'Не удалось определить версию проекта.' }
  $deployArchive = Join-Path ([IO.Path]::GetTempPath()) "portfolio-release-$release.tar.gz"
  git archive --format=tar.gz --output=$deployArchive HEAD
  if ($LASTEXITCODE -ne 0) { throw 'Не удалось собрать архив.' }
  scp -i $Key -o BatchMode=yes $deployArchive "root@${Server}:/tmp/portfolio-release-$release.tar.gz"
  if ($LASTEXITCODE -ne 0) { throw 'Не удалось передать архив.' }
  scp -i $Key -o BatchMode=yes ops/deploy-release.sh "root@${Server}:/tmp/portfolio-deploy-release.sh"
  if ($LASTEXITCODE -ne 0) { throw 'Не удалось передать сценарий обновления.' }
  ssh -i $Key -o BatchMode=yes "root@$Server" "sh /tmp/portfolio-deploy-release.sh $release"
  if ($LASTEXITCODE -ne 0) { throw 'Проверка сервера завершилась ошибкой. Посмотрите сообщение выше.' }
  Write-Host "Опубликована версия $release на https://sherer-dev.ru" -ForegroundColor Green
} finally {
  Pop-Location
}
