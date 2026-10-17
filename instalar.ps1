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

<#
  A ficha: os dados da instalação preenchidos antes, num arquivo.

  Uma instalação inteira levava 1h20, e a maior parte não era o portal do
  Meta: era abrir aba, colar valor, conferir no guia se estava no passo certo,
  voltar. Preenchida a ficha, o instalador não pergunta mais nada e roda
  sozinho.

  Lê-se assim, antes do `irm`:

    $env:FICHA="C:\caminho\ficha-da-maria.txt"

  Pelo ambiente, e não por parâmetro, porque o jeito documentado de rodar isto
  é `irm ... | iex` — e script executado assim não recebe parâmetro.

  O valor é tudo que vem depois do PRIMEIRO dois-pontos: connection string e
  token têm `:` no meio, e cortar no último arrancaria pedaço do segredo.
#>
function LerFicha($caminho) {
  $ficha = @{}
  if (-not $caminho) { return $ficha }
  if (-not (Test-Path $caminho)) { Erro "nao achei a ficha em '$caminho'. Confira o caminho." }

  foreach ($linha in (Get-Content -Path $caminho -Encoding UTF8)) {
    $texto = $linha.Trim()
    if ($texto -eq '' -or $texto.StartsWith('#')) { continue }
    $corte = $texto.IndexOf(':')
    if ($corte -lt 1) { continue }
    $chave = $texto.Substring(0, $corte).Trim()
    $valor = $texto.Substring($corte + 1).Trim()
    if ($valor -ne '') { $ficha[$chave] = $valor }
  }
  return $ficha
}

$FICHA = LerFicha $env:FICHA
$COM_FICHA = $null -ne $env:FICHA -and $env:FICHA -ne ''

<#
  Um valor: da ficha, ou perguntado.

  Com ficha, campo que falta é erro na hora, com o nome do campo — e não uma
  pergunta no meio de uma execução que era para ser sozinha.
#>
function Campo($chave, $rotulo, $secreto) {
  if ($FICHA.ContainsKey($chave)) { return $FICHA[$chave] }
  if ($COM_FICHA) { Erro "falta '$chave' na ficha ($env:FICHA)." }
  if ($secreto) { return PerguntaSecreta $rotulo }
  return Pergunta $rotulo
}

function CampoOpcional($chave) {
  if ($FICHA.ContainsKey($chave)) { return $FICHA[$chave] }
  return $null
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
  O banco, nascido dentro da conta Vercel dela.

  Este e o caminho curto, e e o que o botao de deploy sempre fez por tras: a
  Vercel tem o Neon no marketplace dela, e um comando so instala a integracao,
  cria o banco, liga no projeto e grava a `DATABASE_URL` nas variaveis. Quem
  instala nao abre o Neon, nao cria conta la, nao procura connection string e
  nao gera chave de API nenhuma.

  Exige a CLI da Vercel, que vem por `npx`: ou seja, exige Node na maquina de
  quem esta instalando. Quem nao tiver cai no caminho antigo, que continua
  inteiro logo abaixo.

  `--cwd` aponta para uma pasta vazia e temporaria: a CLI quer uma pasta ligada
  a um projeto, e nao ha clone local nenhum aqui. O `link` faz essa ligacao sem
  baixar o repositorio.

  **A primeira instalacao numa conta nova pode parar nos termos do
  marketplace.** A Vercel exige confirmacao humana, em terminal interativo,
  antes de instalar uma integracao pela primeira vez naquela conta. Quando isso
  acontece o comando falha dizendo isso, e a saida e rodar
  `vercel integration accept-terms neon` uma vez — por conta, nao por projeto.
#>
function BancoPelaVercel($nomeProjeto, $token) {
  Titulo "O banco de dados"
  Passo 'Criando pela propria Vercel: a DATABASE_URL entra sozinha.'

  $npx = (Get-Command npx -ErrorAction SilentlyContinue)
  if (-not $npx) {
    Passo 'nao achei o npx (Node) nesta maquina; vou pelo caminho antigo.'
    return $false
  }

  $pasta = Join-Path ([IO.Path]::GetTempPath()) ("instalar-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $pasta -Force | Out-Null

  # O token NAO vai na linha de comando: no Windows qualquer processo da
  # maquina consegue ler a linha de comando dos outros, e isso e a conta
  # Vercel inteira de quem esta instalando, exposta pelo tempo da chamada. A
  # CLI le `VERCEL_TOKEN` do ambiente, que fica dentro deste processo.
  $tokenDeAntes = $env:VERCEL_TOKEN
  $env:VERCEL_TOKEN = $token

  try {
    # A saida das duas chamadas vai para a tela: elas demoram, e tela parada
    # faz quem esta instalando achar que travou.
    & npx --yes $CLI_DA_VERCEL link --yes --project $nomeProjeto --cwd $pasta
    if ($LASTEXITCODE -ne 0) {
      Passo "nao consegui ligar a pasta ao projeto; vou pelo caminho antigo."
      return $false
    }

    & npx --yes $CLI_DA_VERCEL integration add neon --non-interactive --cwd $pasta
    if ($LASTEXITCODE -ne 0) {
      Write-Host ""
      Write-Host "   A Vercel nao criou o banco. O motivo mais comum, numa conta nova,"
      Write-Host "   sao os termos do marketplace, que precisam ser aceitos uma vez:"
      Write-Host ""
      Write-Host "     npx vercel integration accept-terms neon"
      Write-Host "   (com VERCEL_TOKEN no ambiente, ou ja logado na conta dela)"
      Write-Host ""
      Write-Host "   Aceite e rode o instalador de novo, ou siga pelo caminho antigo."
      return $false
    }

    Passo "banco criado e ligado ao projeto"
    return $true
  } finally {
    # Devolve o que estava la: quem instala pode ter o proprio token no
    # ambiente, e sair levando ele embora quebraria o resto da sessao dela.
    if ($null -eq $tokenDeAntes) {
      Remove-Item Env:\VERCEL_TOKEN -ErrorAction SilentlyContinue
    } else {
      $env:VERCEL_TOKEN = $tokenDeAntes
    }
    Remove-Item -Recurse -Force $pasta -ErrorAction SilentlyContinue
  }
}

<#
  O banco, criado aqui dentro.

  O caminho antigo, para quem nao tem Node na maquina ou ja tem um banco.

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
  $colada = CampoOpcional 'DATABASE_URL'
  if (-not $colada -and -not $COM_FICHA) {
    $colada = PerguntaSecreta "Connection string do Neon (ou Enter para eu criar)"
  }
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
  $chaveNeon = Campo 'NEON_API_KEY' "Chave da API do Neon" $true
  if (-not $chaveNeon) { Erro "sem a chave eu nao consigo criar o banco. Cole a connection string ou a chave." }
  $cabecalhoNeon = @{ Authorization = "Bearer $chaveNeon"; Accept = 'application/json' }

  # A conta pode estar numa organizacao, e desde 2026 a criacao exige dizer em
  # qual. Com uma so, escolho sozinho; com varias, pergunto -- adivinhar poria
  # o banco de um cliente na organizacao de outro.
  $orgs = ChamarApi 'GET' 'https://console.neon.tech/api/v2/users/me/organizations' $cabecalhoNeon $null
  $lista = @($orgs.organizations)
  if ($lista.Count -eq 0) { Erro "essa chave nao enxerga nenhuma organizacao no Neon." }
  $org = $lista[0]
  $orgDaFicha = CampoOpcional 'NEON_ORG'
  if ($orgDaFicha) {
    $achada = $lista | Where-Object { $_.name -eq $orgDaFicha } | Select-Object -First 1
    if (-not $achada) {
      Erro "nao achei a organizacao '$orgDaFicha' no Neon. As que existem: $(($lista | ForEach-Object { $_.name }) -join ', ')."
    }
    $org = $achada
  } elseif ($lista.Count -gt 1 -and $COM_FICHA) {
    # Adivinhar poria o banco de um cliente na organizacao de outro.
    Erro "a conta Neon tem mais de uma organizacao. Escreva qual em 'NEON_ORG' na ficha: $(($lista | ForEach-Object { $_.name }) -join ', ')."
  } elseif ($lista.Count -gt 1) {
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

<#
  Como ChamarApi, mas devolve $null em vez de parar tudo.

  Serve para as perguntas cuja resposta "nao existe" e informacao, e nao
  defeito: o repositorio ja criado numa tentativa anterior, por exemplo.
#>
function TentarApi($metodo, $url, $cabecalhos, $corpo) {
  try {
    $parametros = @{ Method = $metodo; Uri = $url; Headers = $cabecalhos; ErrorAction = 'Stop' }
    if ($null -ne $corpo) {
      # `-InputObject`, e nao `$corpo | ConvertTo-Json`: o pipe desembrulha uma
      # lista de um item so e manda objeto onde a API espera lista. Com oito
      # variaveis ninguem via; com uma, a gravacao seria recusada.
      $parametros.Body = (ConvertTo-Json -InputObject $corpo -Depth 10 -Compress)
      $parametros.ContentType = 'application/json'
    }
    return Invoke-RestMethod @parametros
  } catch { return $null }
}

function ChamarApi($metodo, $url, $cabecalhos, $corpo) {
  try {
    $parametros = @{ Method = $metodo; Uri = $url; Headers = $cabecalhos; ErrorAction = 'Stop' }
    if ($null -ne $corpo) {
      # `-InputObject`, e nao `$corpo | ConvertTo-Json`: o pipe desembrulha uma
      # lista de um item so e manda objeto onde a API espera lista. Com oito
      # variaveis ninguem via; com uma, a gravacao seria recusada.
      $parametros.Body = (ConvertTo-Json -InputObject $corpo -Depth 10 -Compress)
      $parametros.ContentType = 'application/json'
    }
    return Invoke-RestMethod @parametros
  } catch {
    $resposta = $_.ErrorDetails.Message
    if (-not $resposta) { $resposta = $_.Exception.Message }
    Erro "a chamada para $url falhou. O serviço respondeu: $resposta"
  }
}

<#
  A CLI da Vercel, numa versao fixa.

  `vercel@latest` baixaria, a cada instalacao, o que estivesse publicado no
  npm naquele minuto — e logo em seguida esse codigo recebe o acesso a conta
  Vercel de quem esta instalando. Versao fixa e versao que alguem olhou.

  Para subir: rode a versao nova aqui, confira `integration add neon`, e
  troque este numero. Se a Vercel mudar o comando e esta versao parar de
  funcionar, o erro aparece na tela do instalador, que e onde da para reagir.
#>
$CLI_DA_VERCEL = 'vercel@60.0.1'

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
$produto = CampoOpcional 'produto'
if ($produto) {
  $produto = $produto.ToLower()
  if ($produto -ne 'meuchat' -and $produto -ne 'radar') {
    Erro "o campo 'produto' da ficha precisa ser meuchat ou radar."
  }
} else {
  Passo "1. MEUCHAT  - comentario vira DM, e o painel basico"
  Passo "2. Radar    - a Plataforma completa (precisa do convite da organizacao aceito)"
  $escolha = Pergunta "Digite 1 ou 2"
  if ($escolha -ne '1' -and $escolha -ne '2') { Erro "responda 1 ou 2." }
  $produto = if ($escolha -eq '2') { 'radar' } else { 'meuchat' }
}
$ehRadar = $produto -eq 'radar'
$modelo = if ($ehRadar) { 'adeus-mensalidade/plataforma' } else { 'rafaneaime/rafa-automacao' }
$nomeRepo = CampoOpcional 'nome'
if (-not $nomeRepo) { $nomeRepo = if ($ehRadar) { 'plataforma' } else { 'meu-chat' } }

<#
  O nome vira endereco, nome de repositorio e argumento de linha de comando.

  A conferencia e estreita de proposito. O endereco do painel sai dele
  (`nome.vercel.app`), entao maiuscula, espaco e acento ja nao servem — e,
  como ele tambem entra numa chamada ao `npx`, que no Windows passa pelo
  `cmd.exe`, caractere como `&` ou `|` ali dentro deixaria de ser nome para
  virar comando. Recusar cedo, com a regra escrita, e melhor que descobrir
  isso no meio da instalacao de outra pessoa.
#>
# `-cnotmatch`, e nao `-notmatch`: no PowerShell a comparacao com expressao
# regular ignora maiuscula por padrao, e 'Painel' passava — virando um
# endereco que nao e o nome que o instalador procura depois.
if ($nomeRepo -cnotmatch '^[a-z0-9][a-z0-9-]{0,62}$') {
  Erro "o nome '$nomeRepo' nao serve. Use so letras minusculas, numeros e hifen, comecando por letra ou numero (exemplo: maria-automacao)."
}

$nomeProjeto = $nomeRepo
Passo "produto: $produto"
Passo "nome:    $nomeRepo"
Passo "modelo:  $modelo"

Titulo "As duas chaves temporarias"
Passo "Elas autorizam este instalador a criar o repositorio e publicar."
Passo "Ao terminar, voce revoga as duas. O texto colado nao aparece na tela."
$tokenGitHub = Campo 'GITHUB_TOKEN' "Token do GitHub" $true
$tokenVercel = Campo 'VERCEL_TOKEN' "Token da Vercel" $true

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

<#
  Uma tentativa anterior pode ter criado o repositorio e parado depois - na
  conexao da Vercel com o GitHub, por exemplo. Recomecar do zero obrigaria a
  pessoa a apagar o repositorio na mao, no meio da sessao, so para o instalador
  aceitar continuar. Se o que esta la veio do nosso modelo, ele serve.

  A conferencia e pelo `template_repository`: repositorio com o mesmo nome que
  veio de outro lugar nao e nosso, e sobrescrever o trabalho de alguem para
  seguir em frente seria pior que parar.
#>
$copia = TentarApi 'GET' "https://api.github.com/repos/$($usuario.login)/$nomeRepo" $cabecalhoGitHub $null
if ($copia) {
  if ($copia.template_repository.full_name -ne $modelo) {
    Erro "voce ja tem um repositorio chamado '$nomeRepo' que nao veio deste sistema. Renomeie ou apague esse repositorio e rode de novo."
  }
  Passo "repositorio ja existia, de uma tentativa anterior: $($copia.full_name)"
} else {
  $copia = ChamarApi 'POST' "https://api.github.com/repos/$modelo/generate" $cabecalhoGitHub @{
    owner = $usuario.login; name = $nomeRepo; private = $true
    description = 'Minha instalacao'
  }
  Passo "repositorio: $($copia.full_name)"
}

Titulo "Criando o projeto na Vercel"

<#
  O projeto tambem pode ter sobrado de uma tentativa anterior.

  E o erro mais provavel aqui nao e erro de digitacao: a Vercel so enxerga um
  repositorio do GitHub depois que a conta dela e ligada a conta do GitHub. Sem
  isso ela responde "repository couldn't be found", que manda a pessoa procurar
  um erro de nome que nao existe.
#>
$projeto = TentarApi 'GET' "https://api.vercel.com/v9/projects/$nomeProjeto" $cabecalhoVercel $null
if ($projeto) {
  Passo "projeto ja existia, de uma tentativa anterior: $($projeto.name)"
} else {
  $projeto = TentarApi 'POST' 'https://api.vercel.com/v11/projects' $cabecalhoVercel @{
    name = $nomeProjeto
    framework = 'nextjs'
    gitRepository = @{ type = 'github'; repo = $copia.full_name }
  }
  if (-not $projeto) {
    Write-Host ""
    Write-Host "A Vercel nao achou o repositorio '$($copia.full_name)'."
    Write-Host "Quase sempre e isto: a conta da Vercel ainda nao esta ligada ao GitHub."
    Write-Host ""
    Write-Host "Como resolver, na conta dela:"
    Write-Host "  1. abra vercel.com e clique em Add New -> Project"
    Write-Host "  2. em Import Git Repository, clique em Continue with GitHub e autorize"
    Write-Host "  3. se o GitHub perguntar quais repositorios, escolha All repositories"
    Write-Host "  4. volte aqui e rode o instalador de novo - o que ja foi criado e reaproveitado"
    Erro "a Vercel precisa enxergar o GitHub antes de continuar."
  }
  Passo "projeto: $($projeto.name)"
}

<#
  Perguntar so o que ainda nao esta gravado.

  Uma instalacao que para no meio e roda de novo pedia os oito campos outra
  vez, inclusive os que ja estavam salvos. Pior que o incomodo: o VERIFY_TOKEN
  era sorteado de novo a cada execucao, e quem ja tinha colado o anterior no
  portal do Meta ficava com um webhook que para de validar sem dizer por que.

  Por isso a pergunta vem DEPOIS de o projeto existir: so entao da para saber o
  que ja esta la.
#>
Titulo "Os dados do seu sistema"
$gravadas = @{}
$atuais = TentarApi 'GET' "https://api.vercel.com/v9/projects/$($projeto.id)/env?decrypt=true" $cabecalhoVercel $null
foreach ($e in @($atuais.envs)) {
  if ($e.target -contains 'production' -and $e.key) { $gravadas[$e.key] = $e.value }
}
if ($gravadas.Count -gt 0) { Passo "$($gravadas.Count) valor(es) ja estavam gravados; nao vou pedir de novo." }

function JaTem($chave) { return $gravadas.ContainsKey($chave) }

$novos = @{}

<#
  O banco: primeiro pela Vercel, e so depois pelo caminho antigo.

  Quando a Vercel cria, ela mesma grava a `DATABASE_URL` nas variaveis do
  projeto — por isso nao entra em `$novos`, e por isso a leitura das variaveis
  e refeita logo abaixo: sem isso o instalador nao saberia que o banco ja
  esta la, e tentaria pedir de novo.

  Com `DATABASE_URL` na ficha, nada disso acontece: quem colou um banco quer
  aquele banco.
#>
if (-not (JaTem 'DATABASE_URL')) {
  $bancoDaFicha = CampoOpcional 'DATABASE_URL'
  if ($bancoDaFicha) {
    $novos['DATABASE_URL'] = CriarOuPedirBanco $nomeProjeto
  } elseif (BancoPelaVercel $nomeProjeto $tokenVercel) {
    $atuais = TentarApi 'GET' "https://api.vercel.com/v9/projects/$($projeto.id)/env?decrypt=true" $cabecalhoVercel $null
    foreach ($e in @($atuais.envs)) {
      if ($e.target -contains 'production' -and $e.key) { $gravadas[$e.key] = $e.value }
    }
    if (-not (JaTem 'DATABASE_URL')) {
      Erro "a Vercel disse que criou o banco, mas a DATABASE_URL nao apareceu nas variaveis do projeto. Abra o projeto na Vercel e confira em Storage."
    }
  } else {
    $novos['DATABASE_URL'] = CriarOuPedirBanco $nomeProjeto
  }
}
if (-not (JaTem 'IG_APP_ID'))      { $novos['IG_APP_ID']      = Campo 'IG_APP_ID' "IG_APP_ID (numero do app do Instagram)" $false }
if (-not (JaTem 'IG_APP_SECRET'))  { $novos['IG_APP_SECRET']  = Campo 'IG_APP_SECRET' "IG_APP_SECRET" $true }
if (-not (JaTem 'ACCESS_TOKEN'))   { $novos['ACCESS_TOKEN']   = Campo 'ACCESS_TOKEN' "ACCESS_TOKEN (o token gerado no portal)" $true }
if (-not (JaTem 'EMAIL_CONTATO'))  { $novos['EMAIL_CONTATO']  = Campo 'EMAIL_CONTATO' "E-mail de contato (aparece na politica de privacidade)" $false }

# A senha em branco na ficha nao e esquecimento: e "sorteia uma". Ela aparece
# no fim, junto com o endereco, para ser passada adiante de uma vez so.
$senhaSorteada = $false
if (-not (JaTem 'PANEL_PASSWORD')) {
  $daFicha = CampoOpcional 'PANEL_PASSWORD'
  if ($daFicha) {
    $novos['PANEL_PASSWORD'] = $daFicha
  } elseif ($COM_FICHA) {
    $novos['PANEL_PASSWORD'] = Segredo
    $senhaSorteada = $true
  } else {
    $novos['PANEL_PASSWORD'] = PerguntaSecreta "Senha que voce quer usar para entrar no painel"
  }
}

# Os dois segredos que ninguem digita. Sorteados so na primeira vez: trocar o
# VERIFY_TOKEN de uma instalacao que ja existe quebra o webhook ja configurado.
if (-not (JaTem 'VERIFY_TOKEN')) { $novos['VERIFY_TOKEN'] = Segredo }
if (-not (JaTem 'CRON_SECRET'))  { $novos['CRON_SECRET']  = Segredo }

$verifyToken = if ($novos.ContainsKey('VERIFY_TOKEN')) { $novos['VERIFY_TOKEN'] } else { $gravadas['VERIFY_TOKEN'] }

Titulo "Guardando as variaveis"
if ($novos.Count -eq 0) {
  Passo "nada a gravar: tudo ja estava no lugar."
} else {
  $variaveis = $novos.GetEnumerator() | ForEach-Object {
    @{ key = $_.Key; value = $_.Value; type = 'encrypted'; target = @('production') }
  }
  ChamarApi 'POST' "https://api.vercel.com/v10/projects/$($projeto.id)/env?upsert=true" $cabecalhoVercel @($variaveis) | Out-Null
  Passo "$($novos.Count) variavel(is) gravada(s)"
}

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

<#
  O resumo tambem vai para um arquivo, ao lado da ficha.

  Sao seis valores para repassar — endereco, senha, os dois do webhook — e ate
  aqui eles so existiam rolando na tela do PowerShell. Numa instalacao feita
  para outra pessoa, isso vira copia a mao, e copia a mao de senha erra.

  O arquivo TEM a senha dentro. Fica na maquina de quem instalou, de
  proposito: e para ser mandado para a dona da instalacao e apagado depois.
#>
$senha = if ($novos.ContainsKey('PANEL_PASSWORD')) { $novos['PANEL_PASSWORD'] } else { $null }

$linhas = @()
$linhas += "Instalacao: $nomeProjeto ($produto)"
$linhas += ""
$linhas += "Painel:        $endereco"
if ($senha) {
  $linhas += "Senha:         $senha"
} else {
  $linhas += "Senha:         a mesma de antes (ja estava gravada)"
}
$linhas += ""
$linhas += "No portal do Meta, em Webhooks:"
$linhas += "Callback URL:  $endereco/api/webhook"
if ($verifyToken) {
  $linhas += "Verify Token:  $verifyToken"
} else {
  $linhas += "Verify Token:  o mesmo da instalacao anterior"
}
$linhas += "Campos:        comments, live_comments, messages, messaging_postbacks, messaging_seen"
$linhas += ""
$linhas += "Depois: abra o painel, va em Configuracao e clique em Conectar conta."
$linhas += "Depois disso, comente na publicacao com outra conta para testar."

foreach ($linha in $linhas) { Write-Host "   $linha" }

if ($COM_FICHA) {
  $resumo = Join-Path (Split-Path -Parent $env:FICHA) "$nomeProjeto-instalacao.txt"
  try {
    Set-Content -Path $resumo -Value $linhas -Encoding UTF8
    Write-Host ""
    Write-Host "   Isto tambem esta em: $resumo"
    Write-Host "   Mande para a pessoa e apague o arquivo: a senha esta dentro."
  } catch {
    Write-Host ""
    Write-Host "   Nao consegui salvar o resumo em arquivo. Copie da tela."
  }
}

Write-Host ""
if ($senhaSorteada) {
  Write-Host "   A senha acima foi sorteada por mim: ela nao existe em outro lugar."
}
Write-Host "   Agora pode revogar as chaves usadas: GitHub, Vercel e, se tiver"
Write-Host "   usado, a do Neon."
Write-Host ""
