# Instalador do MEUCHAT — publica o sistema na conta da própria pessoa.
#
# Roda no PowerShell que já vem no Windows. Não instala nada: fala direto com
# as APIs do GitHub e da Vercel. Existe porque a parte de publicar era vinte
# minutos de cliques em telas que mudam de lugar, e agora é uma linha.
#
# O que ele NÃO faz, de propósito: criar contas, fazer login e mexer no portal
# do Meta. Isso é credencial pessoal, e quem digita é a dona da conta.
#
# Uso:
#   irm https://raw.githubusercontent.com/rafaneaime/rafa-automacao/main/instalar.ps1 | iex

$ErrorActionPreference = 'Stop'

function Titulo($texto) { Write-Host ""; Write-Host "== $texto" }
function Passo($texto)  { Write-Host "   $texto" }
# `exit` mataria a janela inteira: rodando por `irm | iex`, o script e a sessao
# sao a mesma coisa, e o PowerShell fecha levando a mensagem junto. Quem
# instala ve a tela sumir e conclui que "nao aconteceu nada". `throw` para o
# script, mostra o motivo e deixa o console de pe.
function Erro($texto)   { Write-Host ""; Write-Host "PROBLEMA: $texto"; Write-Host ""; throw $texto }

function PerguntaSecreta($rotulo) {
  $segura = Read-Host -Prompt "   $rotulo" -AsSecureString
  $texto = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura))
  if ([string]::IsNullOrWhiteSpace($texto)) { Erro "$rotulo não pode ficar em branco." }
  return $texto.Trim()
}

function Pergunta($rotulo) {
  $texto = Read-Host -Prompt "   $rotulo"
  if ([string]::IsNullOrWhiteSpace($texto)) { Erro "$rotulo não pode ficar em branco." }
  return $texto.Trim()
}

# 48 caracteres de acaso, para o VERIFY_TOKEN e o CRON_SECRET — que ninguém
# precisa inventar nem decorar.
#
# O sorteio vem do gerador criptográfico do Windows, e não de `Get-Random`:
# aquele é previsível a partir da semente, e estes dois valores são segredos de
# verdade. O `-ge 248` descarta os bytes que sobrariam na divisão por 62 e
# enviesariam as primeiras letras do alfabeto.
function Segredo {
  $alfabeto = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  $gerador = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $texto = New-Object System.Text.StringBuilder
    $byte = New-Object byte[] 1
    while ($texto.Length -lt 48) {
      $gerador.GetBytes($byte)
      if ($byte[0] -ge 248) { continue }
      [void]$texto.Append($alfabeto[$byte[0] % $alfabeto.Length])
    }
    return $texto.ToString()
  } finally { $gerador.Dispose() }
}

<#
  O banco, criado aqui dentro.

  Achar a connection string no Neon e o passo que mais atrasa a sessao: ela
  aparece uma vez na tela de boas-vindas e depois some atras de um botao que
  muda de lugar a cada reforma do painel. Quem ja tem a string cola e segue;
  quem nao tem cola uma chave de API e o banco nasce aqui, com o nome do
  projeto.

  A chave da API nao fica em lugar nenhum: serve a esta chamada e some quando o
  PowerShell fecha. Ela da acesso total a conta Neon da pessoa, entao a tela
  diz, em voz alta, para revoga-la junto com as outras duas no fim.
#>
function CriarOuPedirBanco($nome) {
  Titulo "O banco de dados"
  Passo "Se voce ja tem a connection string do Neon, cole agora."
  Passo "Se nao tiver, deixe em branco e aperte Enter: eu crio o banco."
  $colada = PerguntaSecreta "Connection string do Neon (ou Enter para eu criar)"
  if ($colada) {
    if (-not $colada.StartsWith('postgres')) {
      Erro "isso nao parece uma connection string. Ela comeca com postgresql://"
    }
    return $colada
  }

  Passo ""
  Passo "Vou criar o banco. Para isso preciso de uma chave da API do Neon:"
  Passo "  console.neon.tech -> seu avatar -> Account settings -> API keys"
  Passo "  -> Create new API key. Copie e cole aqui."
  Passo "Essa chave abre a sua conta Neon inteira. Revogue no fim, junto com"
  Passo "as outras duas."
  $chaveNeon = PerguntaSecreta "Chave da API do Neon"
  if (-not $chaveNeon) { Erro "sem a chave eu nao consigo criar o banco. Cole a connection string ou a chave." }
  $cabecalhoNeon = @{ Authorization = "Bearer $chaveNeon"; Accept = 'application/json' }

  # A conta pode estar numa organizacao, e desde 2026 a criacao exige dizer em
  # qual. Com uma so, escolho sozinho; com varias, pergunto -- adivinhar poria
  # o banco de um cliente na organizacao de outro.
  $orgs = ChamarApi 'GET' 'https://console.neon.tech/api/v2/users/me/organizations' $cabecalhoNeon $null
  $lista = @($orgs.organizations)
  if ($lista.Count -eq 0) { Erro "essa chave nao enxerga nenhuma organizacao no Neon." }
  $org = $lista[0]
  if ($lista.Count -gt 1) {
    Passo "Sua conta tem mais de uma organizacao no Neon:"
    for ($i = 0; $i -lt $lista.Count; $i++) { Passo "  $($i + 1). $($lista[$i].name)" }
    $qual = Pergunta "Digite o numero da organizacao"
    $indice = 0
    if (-not [int]::TryParse($qual, [ref]$indice) -or $indice -lt 1 -or $indice -gt $lista.Count) {
      Erro "responda com um dos numeros da lista."
    }
    $org = $lista[$indice - 1]
  }
  Passo "organizacao: $($org.name)"

  $criado = ChamarApi 'POST' 'https://console.neon.tech/api/v2/projects' $cabecalhoNeon @{
    project = @{ name = $nome; org_id = $org.id }
  }
  $uri = $criado.connection_uris[0].connection_uri
  if (-not $uri) { Erro "o Neon criou o projeto mas nao devolveu a connection string. Pegue no painel e rode de novo." }
  Passo "banco criado: $($criado.project.name)"
  return $uri
}

function ChamarApi($metodo, $url, $cabecalhos, $corpo) {
  try {
    $parametros = @{ Method = $metodo; Uri = $url; Headers = $cabecalhos; ErrorAction = 'Stop' }
    if ($null -ne $corpo) {
      $parametros.Body = ($corpo | ConvertTo-Json -Depth 10 -Compress)
      $parametros.ContentType = 'application/json'
    }
    return Invoke-RestMethod @parametros
  } catch {
    $resposta = $_.ErrorDetails.Message
    if (-not $resposta) { $resposta = $_.Exception.Message }
    Erro "a chamada para $url falhou. O serviço respondeu: $resposta"
  }
}

Write-Host ""
Write-Host "Instalador do MEUCHAT"
Write-Host "Publica o sistema na SUA conta. Nada fica na conta de outra pessoa."
Write-Host ""
Write-Host "Antes de comecar voce precisa ter, nesta ordem:"
Write-Host "  1. o app do Instagram criado no portal do Meta, com o token gerado"
Write-Host "  2. uma conta no Neon (o banco eu crio aqui, se voce deixar)"
Write-Host "  3. um token do GitHub e um token da Vercel (o passo a passo explica)"
Write-Host ""

Titulo "O que vamos instalar"
Passo "1. MEUCHAT  - comentario vira DM, e o painel basico"
Passo "2. Radar    - a Plataforma completa (precisa do convite da organizacao aceito)"
$escolha = Pergunta "Digite 1 ou 2"
if ($escolha -ne '1' -and $escolha -ne '2') { Erro "responda 1 ou 2." }
$modelo = if ($escolha -eq '2') { 'adeus-mensalidade/plataforma' } else { 'rafaneaime/rafa-automacao' }
$nomeRepo = if ($escolha -eq '2') { 'plataforma' } else { 'meu-chat' }
$nomeProjeto = $nomeRepo
Passo "modelo: $modelo"

Titulo "As duas chaves temporarias"
Passo "Elas autorizam este instalador a criar o repositorio e publicar."
Passo "Ao terminar, voce revoga as duas. O texto colado nao aparece na tela."
$tokenGitHub = PerguntaSecreta "Token do GitHub"
$tokenVercel = PerguntaSecreta "Token da Vercel"

Titulo "Os dados do seu sistema"
$conexaoBanco = CriarOuPedirBanco $nomeProjeto
$igAppId      = Pergunta "IG_APP_ID (numero do app do Instagram)"
$igAppSecret  = PerguntaSecreta "IG_APP_SECRET"
$accessToken  = PerguntaSecreta "ACCESS_TOKEN (o token gerado no portal)"
$senhaPainel  = PerguntaSecreta "Senha que voce quer usar para entrar no painel"
$emailContato = Pergunta "E-mail de contato (aparece na politica de privacidade)"

$verifyToken = Segredo
$cronSecret  = Segredo

$cabecalhoGitHub = @{
  Authorization = "Bearer $tokenGitHub"
  Accept        = 'application/vnd.github+json'
  'User-Agent'  = 'instalador-meuchat'
}
$cabecalhoVercel = @{ Authorization = "Bearer $tokenVercel" }

Titulo "Conferindo as chaves"
$usuario = ChamarApi 'GET' 'https://api.github.com/user' $cabecalhoGitHub $null
Passo "GitHub: $($usuario.login)"
$eu = ChamarApi 'GET' 'https://api.vercel.com/v2/user' $cabecalhoVercel $null
Passo "Vercel: $($eu.user.username)"

Titulo "Criando a sua copia do codigo"
$copia = ChamarApi 'POST' "https://api.github.com/repos/$modelo/generate" $cabecalhoGitHub @{
  owner = $usuario.login; name = $nomeRepo; private = $true
  description = 'Minha instalacao'
}
Passo "repositorio: $($copia.full_name)"

Titulo "Criando o projeto na Vercel"
$projeto = ChamarApi 'POST' 'https://api.vercel.com/v11/projects' $cabecalhoVercel @{
  name = $nomeProjeto
  framework = 'nextjs'
  gitRepository = @{ type = 'github'; repo = $copia.full_name }
}
Passo "projeto: $($projeto.name)"

Titulo "Guardando as variaveis"
$variaveis = @(
  @{ key = 'IG_APP_ID';      value = $igAppId },
  @{ key = 'IG_APP_SECRET';  value = $igAppSecret },
  @{ key = 'VERIFY_TOKEN';   value = $verifyToken },
  @{ key = 'ACCESS_TOKEN';   value = $accessToken },
  @{ key = 'DATABASE_URL';   value = $conexaoBanco },
  @{ key = 'PANEL_PASSWORD'; value = $senhaPainel },
  @{ key = 'CRON_SECRET';    value = $cronSecret },
  @{ key = 'EMAIL_CONTATO';  value = $emailContato }
) | ForEach-Object { @{ key = $_.key; value = $_.value; type = 'encrypted'; target = @('production') } }

ChamarApi 'POST' "https://api.vercel.com/v10/projects/$($projeto.id)/env?upsert=true" $cabecalhoVercel $variaveis | Out-Null
Passo "$($variaveis.Count) variaveis gravadas"

Titulo "Publicando"
$publicacao = ChamarApi 'POST' 'https://api.vercel.com/v13/deployments' $cabecalhoVercel @{
  name = $nomeProjeto
  project = $projeto.id
  target = 'production'
  gitSource = @{ type = 'github'; repoId = $copia.id; ref = 'main' }
}
Passo "comecou. Isso leva um ou dois minutos."

$estado = ''
for ($tentativa = 1; $tentativa -le 90; $tentativa++) {
  Start-Sleep -Seconds 5
  $situacao = ChamarApi 'GET' "https://api.vercel.com/v13/deployments/$($publicacao.id)" $cabecalhoVercel $null
  $estado = $situacao.readyState
  if ($estado -eq 'READY' -or $estado -eq 'ERROR' -or $estado -eq 'CANCELED') { break }
}

if ($estado -ne 'READY') {
  Erro "a publicacao terminou como $estado. Abra vercel.com, entre no projeto $nomeProjeto, aba Deployments, e me mande a ultima linha do log."
}

# O endereco CURTO, e nao o da publicacao.
#
# Cada publicacao ganha um endereco proprio, com letras embaralhadas no meio
# (...-9265f73td-...). Ele funciona hoje e para de funcionar na proxima
# publicacao — e quem colou esse no webhook do Meta descobre dias depois, com
# a automacao muda e nenhuma mensagem de erro. O endereco do projeto nao muda.
$dados = ChamarApi 'GET' "https://api.vercel.com/v9/projects/$($projeto.id)" $cabecalhoVercel $null
$curto = $dados.targets.production.alias | Where-Object { $_ -eq "$nomeProjeto.vercel.app" } | Select-Object -First 1
if (-not $curto) {
  $curto = $dados.targets.production.alias | Sort-Object Length | Select-Object -First 1
}
if (-not $curto) { Erro "a publicacao terminou, mas a Vercel nao devolveu o endereco do projeto. Abra vercel.com e pegue o endereco na tela do projeto." }
$endereco = "https://$curto"

Titulo "Pronto"
Write-Host ""
Write-Host "   Seu painel:      $endereco"
Write-Host "   Entre com a senha que voce escolheu agora ha pouco."
Write-Host ""
Write-Host "   Falta so o webhook, no portal do Meta. Cole estes dois valores:"
Write-Host ""
Write-Host "   Callback URL:    $endereco/api/webhook"
Write-Host "   Verify Token:    $verifyToken"
Write-Host ""
Write-Host "   Guarde o Verify Token: ele nao aparece de novo nesta tela."
Write-Host "   Depois de assinar os campos do webhook, comente na sua publicacao"
Write-Host "   com a segunda conta do Instagram para testar."
Write-Host ""
Write-Host "   Agora pode revogar as chaves que voce colou no comeco: GitHub, Vercel"
Write-Host "   e, se tiver usado, a do Neon."
Write-Host ""
