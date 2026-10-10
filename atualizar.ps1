# Atualização para o Radar — troca o código do painel que já existe.
#
# Os doze passos do guia viram um comando. Nenhum deles é difícil sozinho, mas
# cinco são armadilha: "Use this template" e não fork, marcar Private, o
# Disconnect antes do Connect, ligar no repositório da PRÓPRIA conta e não no da
# organização, e "Create Deployment" em vez de "Redeploy". Errar qualquer um
# deixa o painel abrindo errado, zerado ou sem o Radar no menu.
#
# O que este script NÃO faz, de propósito: não toca no banco, não apaga
# variável, não cria projeto novo. O painel que existe continua o mesmo, com os
# mesmos contatos e as mesmas automações — só o código que ele roda muda.
#
# Rode assim, no PowerShell:
#
#   irm https://raw.githubusercontent.com/rafaneaime/rafa-automacao/main/atualizar.ps1 | iex

$ErrorActionPreference = 'Stop'

function Titulo($texto) { Write-Host ""; Write-Host "== $texto" }
function Passo($texto)  { Write-Host "   $texto" }

# `exit` mataria a janela inteira: rodando por `irm | iex`, o script e a sessão
# são a mesma coisa. `throw` para o script e deixa a mensagem na tela.
function Erro($texto)   { Write-Host ""; Write-Host "PROBLEMA: $texto"; Write-Host ""; throw $texto }

function PerguntaSecreta($rotulo) {
  $segura = Read-Host -Prompt "   $rotulo" -AsSecureString
  $ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro) }
}

function Pergunta($rotulo) { return (Read-Host -Prompt "   $rotulo").Trim() }

function ChamarApi($metodo, $url, $cabecalhos, $corpo) {
  try {
    $parametros = @{ Method = $metodo; Uri = $url; Headers = $cabecalhos; ErrorAction = 'Stop' }
    if ($null -ne $corpo) {
      # `-InputObject`, e não pipe: o pipe desembrulha lista de um item só.
      $parametros.Body = (ConvertTo-Json -InputObject $corpo -Depth 10 -Compress)
      $parametros.ContentType = 'application/json'
    }
    return Invoke-RestMethod @parametros
  } catch {
    $resposta = $_.ErrorDetails.Message
    if (-not $resposta) { $resposta = $_.Exception.Message }
    Erro "a chamada para $url falhou. O servico respondeu: $resposta"
  }
}

function TentarApi($metodo, $url, $cabecalhos, $corpo) {
  try {
    $parametros = @{ Method = $metodo; Uri = $url; Headers = $cabecalhos; ErrorAction = 'Stop' }
    if ($null -ne $corpo) {
      $parametros.Body = (ConvertTo-Json -InputObject $corpo -Depth 10 -Compress)
      $parametros.ContentType = 'application/json'
    }
    return Invoke-RestMethod @parametros
  } catch { return $null }
}

$MODELO = 'adeus-mensalidade/plataforma'

Write-Host ""
Write-Host "Atualizacao para o Radar"
Write-Host "Troca o codigo do painel que voce ja usa. O banco, os contatos e as"
Write-Host "automacoes continuam onde estao - nada aqui apaga nada."
Write-Host ""
Write-Host "Antes de comecar: aceite o convite da organizacao que chegou no seu"
Write-Host "e-mail. Sem ele, o modelo do Radar nao aparece para a sua conta."
Write-Host ""

Titulo "As duas chaves temporarias"
Passo "Elas autorizam a copia do codigo e a troca no painel."
Passo "O texto colado nao aparece na tela."
$tokenGitHub = PerguntaSecreta "Token do GitHub (escopo repo)"
$tokenVercel = PerguntaSecreta "Token da Vercel"
if (-not $tokenGitHub -or -not $tokenVercel) { Erro "preciso das duas chaves para continuar." }

$cabecalhoGitHub = @{
  Authorization = "Bearer $tokenGitHub"
  Accept        = 'application/vnd.github+json'
  'User-Agent'  = 'atualizador-radar'
}
$cabecalhoVercel = @{ Authorization = "Bearer $tokenVercel" }

Titulo "Conferindo as chaves"
$usuario = ChamarApi 'GET' 'https://api.github.com/user' $cabecalhoGitHub $null
Passo "GitHub: $($usuario.login)"
$eu = ChamarApi 'GET' 'https://api.vercel.com/v2/user' $cabecalhoVercel $null
Passo "Vercel: $($eu.user.username)"

# O 404 aqui quer dizer "esse repositório não existe para você" — é assim que o
# GitHub responde para repositório privado que o token não enxerga. O convite
# não aceito é a causa em quase todos os casos.
Titulo "Conferindo o acesso ao modelo do Radar"
if (-not (TentarApi 'GET' "https://api.github.com/repos/$MODELO" $cabecalhoGitHub $null)) {
  Write-Host ""
  Write-Host "Nao consegui enxergar o modelo do Radar com a sua conta."
  Write-Host "Quase sempre e o convite da organizacao, que ainda nao foi aceito:"
  Write-Host ""
  Write-Host "  1. procure no seu e-mail o convite do GitHub para adeus-mensalidade"
  Write-Host "  2. clique em Join @adeus-mensalidade"
  Write-Host "  3. se nao achar o e-mail, abra github.com/orgs/adeus-mensalidade/invitation"
  Write-Host "  4. volte aqui e rode de novo"
  Erro "o convite da organizacao precisa estar aceito."
}
Passo "modelo visivel: $MODELO"

Titulo "Qual painel atualizar"
$projetos = ChamarApi 'GET' 'https://api.vercel.com/v9/projects?limit=100' $cabecalhoVercel $null
$lista = @($projetos.projects)
if ($lista.Count -eq 0) { Erro "essa conta da Vercel nao tem nenhum projeto." }
for ($i = 0; $i -lt $lista.Count; $i++) {
  $ligado = if ($lista[$i].link) { "$($lista[$i].link.org)/$($lista[$i].link.repo)" } else { 'sem repositorio' }
  Passo "$($i + 1). $($lista[$i].name)  ($ligado)"
}
$escolha = Pergunta "Digite o numero do painel que voce ja usa"
$indice = 0
if (-not [int]::TryParse($escolha, [ref]$indice) -or $indice -lt 1 -or $indice -gt $lista.Count) {
  Erro "responda com um dos numeros da lista."
}
$projeto = $lista[$indice - 1]
Passo "escolhido: $($projeto.name)"

Titulo "Criando a sua copia do Radar"
$nomeRepo = 'plataforma'
# Pode ter sobrado de uma tentativa anterior. Se veio do nosso modelo, serve.
$copia = TentarApi 'GET' "https://api.github.com/repos/$($usuario.login)/$nomeRepo" $cabecalhoGitHub $null
if ($copia) {
  if ($copia.template_repository.full_name -ne $MODELO) {
    Erro "voce ja tem um repositorio chamado '$nomeRepo' que nao veio deste sistema. Renomeie ou apague esse repositorio e rode de novo."
  }
  Passo "ja existia, de uma tentativa anterior: $($copia.full_name)"
} else {
  # Private não é opcional: o código do Radar é de quem comprou.
  $copia = ChamarApi 'POST' "https://api.github.com/repos/$MODELO/generate" $cabecalhoGitHub @{
    owner = $usuario.login; name = $nomeRepo; private = $true
    description = 'Meu Radar'
  }
  Passo "repositorio: $($copia.full_name)"
}

Titulo "Trocando o codigo do painel"
# A conta sai da string: aspas dentro de $() dentro de aspas não sobrevivem
# ao PowerShell 5.1, que é o que vem no Windows.
$ligadoAgora = if ($projeto.link) { $projeto.link.org + '/' + $projeto.link.repo } else { 'sem repositorio' }
Passo "de:   $ligadoAgora"
Passo "para: $($copia.full_name)"
$confirma = Pergunta "Digite SIM para trocar"
if ($confirma -ne 'SIM') { Erro "nada foi alterado." }

TentarApi 'DELETE' "https://api.vercel.com/v9/projects/$($projeto.id)/link" $cabecalhoVercel $null | Out-Null
ChamarApi 'POST' "https://api.vercel.com/v10/projects/$($projeto.id)/link" $cabecalhoVercel @{
  type = 'github'; repo = $copia.full_name
} | Out-Null
Passo "trocado"

Titulo "Publicando"
$publicacao = ChamarApi 'POST' 'https://api.vercel.com/v13/deployments' $cabecalhoVercel @{
  name = $projeto.name
  project = $projeto.id
  target = 'production'
  gitSource = @{ type = 'github'; repoId = $copia.id; ref = 'main' }
}
Passo "publicacao em andamento..."
$estado = ''
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 10
  $atual = ChamarApi 'GET' "https://api.vercel.com/v13/deployments/$($publicacao.id)" $cabecalhoVercel $null
  $estado = $atual.readyState
  if ($estado -in @('READY', 'ERROR', 'CANCELED')) { break }
}
if ($estado -ne 'READY') {
  Erro "a publicacao terminou como $estado. Abra vercel.com, veja o log do deploy e me mande o erro."
}
Passo "publicado"

$dados = ChamarApi 'GET' "https://api.vercel.com/v9/projects/$($projeto.id)" $cabecalhoVercel $null
$curto = $dados.targets.production.alias | Where-Object { $_ -eq "$($projeto.name).vercel.app" } | Select-Object -First 1
if (-not $curto) { $curto = $dados.targets.production.alias | Sort-Object Length | Select-Object -First 1 }

Titulo "Pronto"
Write-Host ""
if ($curto) { Write-Host "   Seu painel:  https://$curto" }
Write-Host "   Entre com a MESMA senha de sempre: nada mudou no seu acesso."
Write-Host ""
Write-Host "   Deu certo quando o menu mostrar Radar, Funis, Contatos,"
Write-Host "   Automacoes, Resultados e Configuracoes. Se continuarem so"
Write-Host "   Automacoes, Contatos e Logs, a troca nao pegou - me chame."
Write-Host ""
Write-Host "   Agora pode revogar as duas chaves que voce colou no comeco."
Write-Host ""
