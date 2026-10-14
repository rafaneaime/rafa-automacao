# Atualização para o Radar — troca o código do painel que já existe.
#
# Os doze passos do guia viram um comando. Nenhum deles é difícil sozinho, mas
# cinco são armadilha: "Use this template" e não fork, marcar Private, o
# Disconnect antes do Connect, ligar no repositório da PRÓPRIA conta e não no da
# organização, e "Create Deployment" em vez de "Redeploy". Errar qualquer um
# deixa o painel abrindo errado, zerado ou sem o Radar no menu.
#
# Quem já está no Radar roda o mesmo comando para receber a versão nova: o
# script percebe que o painel já usa a sua cópia e, em vez de criar outra,
# traz para dentro dela os arquivos que mudaram no modelo.
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

# Traz os arquivos do modelo para dentro da copia que ja existe.
#
# Ate 14/10/2026 nao havia este caminho: quem ja estava no Radar e rodava o
# script de novo recebia o codigo VELHO de volta, porque a copia e feita com
# "Use this template", que nao guarda vinculo nenhum com a origem — nao ha
# "Sync fork" para clicar, e republicar a copia so republica o que ja estava
# nela.
#
# O conserto usa como o Git guarda arquivo: pelo conteudo. Dois arquivos
# iguais tem o mesmo identificador nos dois repositorios, e o que nao mudou ja
# esta dentro da copia desde o dia em que ela nasceu. Entao da para montar a
# arvore inteira com os identificadores do modelo e enviar o conteudo so do
# que mudou — normalmente dois ou tres arquivos.
#
# A arvore vai inteira, e nao por cima da que existe: arquivo que sumiu do
# modelo tem que sumir da copia tambem, senao a instalacao acumula codigo que
# ninguem mantem.
function SincronizarComOModelo($cabecalhos, $modelo, $copia, $ramoModelo, $ramoCopia) {
  # `git/trees/<ramo>` devolve em `sha` o identificador do COMMIT, nao o da
  # arvore. Comparar esse valor entre dois repositorios nunca da igual, e a
  # primeira versao disto gravava um commit vazio a cada execucao por causa
  # disso. O identificador da arvore vem do commit, e esse sim e o mesmo nos
  # dois lados quando o conteudo e o mesmo.
  $commitModelo = ChamarApi 'GET' "https://api.github.com/repos/$modelo/commits/$ramoModelo" $cabecalhos $null
  $commitCopia = ChamarApi 'GET' "https://api.github.com/repos/$copia/commits/$ramoCopia" $cabecalhos $null

  if ($commitModelo.commit.tree.sha -eq $commitCopia.commit.tree.sha) {
    Passo "a sua copia ja esta igual ao modelo: nada para trazer"
    return $false
  }

  $doModelo = ChamarApi 'GET' "https://api.github.com/repos/$modelo/git/trees/$($commitModelo.commit.tree.sha)?recursive=1" $cabecalhos $null
  if ($doModelo.truncated) { Erro "o modelo ficou grande demais para este caminho. Me chame." }
  $daCopia = ChamarApi 'GET' "https://api.github.com/repos/$copia/git/trees/$($commitCopia.commit.tree.sha)?recursive=1" $cabecalhos $null

  # Pelo identificador, nao pelo caminho: se QUALQUER arquivo da copia ja tem
  # aquele conteudo, o objeto esta la e nao precisa subir de novo.
  $existentes = New-Object 'System.Collections.Generic.HashSet[string]'
  foreach ($item in $daCopia.tree) {
    if ($item.type -eq 'blob') { [void]$existentes.Add($item.sha) }
  }

  $arquivosDoModelo = @($doModelo.tree | Where-Object { $_.type -eq 'blob' })
  $faltando = @($arquivosDoModelo | Where-Object { -not $existentes.Contains($_.sha) })
  Passo "arquivos novos ou alterados: $($faltando.Count)"

  foreach ($arquivo in $faltando) {
    $conteudo = ChamarApi 'GET' "https://api.github.com/repos/$modelo/git/blobs/$($arquivo.sha)" $cabecalhos $null
    # A API devolve o conteudo quebrado em linhas e nao aceita de volta assim.
    ChamarApi 'POST' "https://api.github.com/repos/$copia/git/blobs" $cabecalhos @{
      content = ($conteudo.content -replace '\s', '')
      encoding = 'base64'
    } | Out-Null
  }

  $entradas = @($arquivosDoModelo | ForEach-Object {
    @{ path = $_.path; mode = $_.mode; type = 'blob'; sha = $_.sha }
  })
  $arvore = ChamarApi 'POST' "https://api.github.com/repos/$copia/git/trees" $cabecalhos @{ tree = $entradas }

  if ($arvore.sha -eq $commitCopia.commit.tree.sha) {
    Passo "o conteudo ja era o mesmo: nada gravado"
    return $false
  }

  $commit = ChamarApi 'POST' "https://api.github.com/repos/$copia/git/commits" $cabecalhos @{
    message = 'Atualizacao do Radar'
    tree = $arvore.sha
    parents = @($commitCopia.sha)
  }
  ChamarApi 'PATCH' "https://api.github.com/repos/$copia/git/refs/heads/$ramoCopia" $cabecalhos @{
    sha = $commit.sha
  } | Out-Null

  Passo "codigo novo gravado na sua copia"
  return $true
}

$MODELO = 'adeus-mensalidade/plataforma'

Write-Host ""
Write-Host "Atualizacao para o Radar"
Write-Host "Serve para os dois casos: virar Radar pela primeira vez e trazer a"
Write-Host "versao nova para um Radar que ja existe. O banco, os contatos e as"
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
$modeloInfo = TentarApi 'GET' "https://api.github.com/repos/$MODELO" $cabecalhoGitHub $null
if (-not $modeloInfo) {
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

Titulo "A sua copia do Radar"
$nomeRepo = 'plataforma'
# A conta sai da string: aspas dentro de $() dentro de aspas nao sobrevivem
# ao PowerShell 5.1, que e o que vem no Windows.
$ligadoAgora = 'sem repositorio'
if ($projeto.link) { $ligadoAgora = $projeto.link.org + '/' + $projeto.link.repo }

# O painel ja pode estar ligado a uma copia do modelo — quem ja tem o Radar e
# so quer a versao nova. Ai nao se cria nem se troca nada: o trabalho e trazer
# o codigo para dentro da copia que ja esta ligada.
$copia = $null
$jaEraORadar = $false
if ($projeto.link) {
  $ligada = TentarApi 'GET' "https://api.github.com/repos/$ligadoAgora" $cabecalhoGitHub $null
  if ($ligada -and $ligada.template_repository.full_name -eq $MODELO) {
    $copia = $ligada
    $jaEraORadar = $true
    Passo "o seu painel ja usa a sua copia do Radar: $($copia.full_name)"
  }
}

if (-not $copia) {
  # Pode ter sobrado de uma tentativa anterior. Se veio do nosso modelo, serve.
  $copia = TentarApi 'GET' "https://api.github.com/repos/$($usuario.login)/$nomeRepo" $cabecalhoGitHub $null
  if ($copia) {
    if ($copia.template_repository.full_name -ne $MODELO) {
      Erro "voce ja tem um repositorio chamado '$nomeRepo' que nao veio deste sistema. Renomeie ou apague esse repositorio e rode de novo."
    }
    Passo "ja existia, de uma tentativa anterior: $($copia.full_name)"
  } else {
    # Private nao e opcional: o codigo do Radar e de quem comprou.
    $copia = ChamarApi 'POST' "https://api.github.com/repos/$MODELO/generate" $cabecalhoGitHub @{
      owner = $usuario.login; name = $nomeRepo; private = $true
      description = 'Meu Radar'
    }
    Passo "repositorio criado: $($copia.full_name)"
  }
}

Titulo "O que vai acontecer"
if ($jaEraORadar) {
  Passo "trazer o codigo novo para $($copia.full_name) e publicar"
} else {
  Passo "de:   $ligadoAgora"
  Passo "para: $($copia.full_name)"
}
Passo "o banco, os contatos, as automacoes e a sua senha ficam como estao"
$confirma = Pergunta "Digite SIM para continuar"
if ($confirma -ne 'SIM') { Erro "nada foi alterado." }

Titulo "Trazendo o codigo novo"
$ramoDoModelo = $modeloInfo.default_branch
$ramoDaCopia = $copia.default_branch
if (-not $ramoDoModelo) { $ramoDoModelo = 'main' }
if (-not $ramoDaCopia) { $ramoDaCopia = 'main' }
SincronizarComOModelo $cabecalhoGitHub $MODELO $copia.full_name $ramoDoModelo $ramoDaCopia | Out-Null

if (-not $jaEraORadar) {
  Titulo "Trocando o codigo do painel"
  TentarApi 'DELETE' "https://api.vercel.com/v9/projects/$($projeto.id)/link" $cabecalhoVercel $null | Out-Null
  ChamarApi 'POST' "https://api.vercel.com/v10/projects/$($projeto.id)/link" $cabecalhoVercel @{
    type = 'github'; repo = $copia.full_name
  } | Out-Null
  Passo "trocado"
}

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
