# Base de problemas — MEUCHAT

Registro de tudo que deu errado durante a montagem real, para consulta durante o
workshop. Organizado por **sintoma**, porque é assim que a pessoa descreve o
problema: "deu tal erro", "não acho tal menu", "não acontece nada".

Cada entrada tem: o que a pessoa vê, a causa real, e o que fazer.

Última atualização: 28/07/2026, a partir de uma montagem real, na conta
`sua_conta` (exemplo — troque pelo nome da sua própria conta do Instagram).

---

## 1. Portal do Meta — antes de gerar o token

### "Não encontro o Instagram no menu do app"

**Vê:** o menu lateral do app mostra Painel, Ações necessárias, Casos de uso,
Configurações do app, Funções do app. Nenhum item "Instagram".

**Causa:** o Instagram não é item de menu. Toda a configuração fica dentro do
card do caso de uso.

**Solução:** **Casos de uso → Personalizar → Configuração da API com login do
Instagram**.

**Nota:** é fácil concluir que o app foi criado errado. Não foi. Confira em
Casos de uso se "Gerenciar mensagens e conteúdo no Instagram" está listado — se
estiver, está tudo certo.

---

### "Usuários de teste mostra 0 de 0 e minha conta não aparece"

**Vê:** a tela "Contas de usuário de teste" com "Contas do Facebook 0 de 0",
vazia, mesmo depois de conectar contas.

**Causa:** essa tela cria contas **simuladas do Facebook**. Não tem relação
nenhuma com Instagram e sempre vai estar vazia neste projeto.

**Solução:** o lugar certo é a aba **Funções**. Lá você atribui **Testador do
Instagram** à sua conta.

---

### "Atribuí a função de testador mas nada acontece"

**Vê:** a conta aparece em Funções, mas o passo 2 não deixa gerar token.

**Causa provável 1:** foi atribuída a função **"Testador"** em vez de
**"Testador do Instagram"**. São papéis diferentes; só o segundo serve.

**Causa provável 2:** o convite não foi aceito. Atribuir a função apenas
*envia* um convite.

**Solução:** aceite pelo navegador, logado na conta do Instagram:

```
https://www.instagram.com/accounts/manage_access/
```

Aba **Convites de testador**.

**Nota:** o app do celular normalmente **não mostra** essa tela. Tem que ser
pelo navegador. Se a aba vier vazia, espere alguns minutos e recarregue.

---

### "O contador de Testadores fica em 0 of 500"

**Vê:** na aba Funções, "Testadores 0 of 500", mesmo com a conta do Instagram
listada logo abaixo.

**Causa:** esse contador é da função "Testador" comum. A função "Testador do
Instagram" não entra nele.

**Solução:** nenhuma. É o comportamento esperado. A evidência de que está certo
é a linha na tabela "Todas as funções", não o contador.

---

### "Sorry, something went wrong" ao conectar o Instagram

**Vê:** erro do Facebook numa URL contendo `oidclink`, ao tentar adicionar a
conta do Instagram.

**Causa:** você está no `business.facebook.com` (Business Suite → Configurações
→ Contas do Instagram). É o caminho que parece óbvio e é o errado.

**Solução:** esse vínculo **não é necessário** no fluxo de login do Instagram —
é justamente a vantagem dele, não precisa de Página do Facebook nem de ativo no
Business Manager. Faça pelo `developers.facebook.com`, dentro do app.

---

## 2. O login do Instagram falhando

### "Não foi possível se conectar ao Instagram. Verifique se você está conectado à Internet"

**Vê:** o popup de login do Instagram aceita o usuário, mas retorna esse erro
em vermelho. Às vezes a primeira tentativa autentica e joga a pessoa no
instagram.com, e a segunda dá o erro.

**Causa:** **não é senha e não é internet.** A mensagem engana. A autenticação
passa; o que falha é o redirect de volta ao Meta.

**Isto foi diagnosticado ao vivo, e o que resolveu foi trocar de aparelho e de
rede.** Ordem de teste, do mais barato ao mais caro:

1. **Celular, com dados móveis (Wi-Fi desligado).** Foi o que funcionou no caso
   real. Faça o fluxo inteiro pelo navegador do celular. Se conectar, o
   problema é a sua máquina ou sua rede.
2. Janela normal, não anônima. Modo privado bloqueia cookies de terceiros e
   quebra o popup de OAuth.
3. Prevenção de rastreamento do navegador em Básico; extensões de privacidade e
   bloqueadores desativados para `instagram.com` e `facebook.com`.
4. Central de Contas → Suas informações e permissões → **Atividade fora das
   tecnologias da Meta**. Se estiver desativada, pode impedir a conexão.

**O que NÃO fazer:** trocar a senha. O erro não é de credencial, e trocas
repetidas somadas a logins falhos são o padrão que o Instagram trata como
atividade suspeita — pode gerar bloqueio de segurança e piorar tudo.

**Hipóteses já descartadas no caso real** (não perca tempo com elas): tipo de
conta (era Business), verificação em duas etapas (não havia), portfólio
empresarial (app novo sem portfólio falhou igual), conta específica (duas contas
diferentes falharam igual), navegador (Chrome e Edge falharam igual).

---

### "Troquei a senha de uma conta e caiu o login de todas"

**Causa:** contas do Instagram na mesma **Central de Contas** compartilham
credencial. Trocar em uma troca em todas.

**Solução:** nenhuma, é o comportamento do produto. Mas saiba disso antes de
trocar senha para "testar" — você derruba a sessão de todas as suas contas.

---

## 3. Credenciais

### "Todo evento chega com assinatura inválida" / `signature_valid = false`

**Vê:** na tela de Logs, seção de eventos recebidos, todos marcados como
assinatura inválida. O webhook responde 401. Nada dispara.

**Causa:** `IG_APP_SECRET` está com o segredo do app **do Facebook**.

O app tem **dois pares de credenciais**:

| Onde | Qual é | Usar? |
|---|---|---|
| Configurações do app → Básico | ID e chave secreta do app do **Facebook** | ❌ |
| Configuração da API com login do Instagram, bloco do topo | ID e chave secreta do app do **Instagram** | ✅ |

**Solução:** use o par do Instagram. São valores completamente diferentes.

**Por que dói:** usar o errado não gera erro nenhum na configuração. O sintoma
aparece só depois, em produção, e não diz a causa.

### Como validar as credenciais antes de seguir

Com o `.env` preenchido, rode isto — se responder 200 com seu username, está
tudo certo:

```bash
node --input-type=module -e "import 'dotenv/config'; const r = await fetch('https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token='+encodeURIComponent(process.env.ACCESS_TOKEN)); console.log(r.status, await r.text());"
```

**Atenção ao resultado:** a resposta traz `user_id` **e** `id`, com valores
diferentes. O `user_id` é o que o projeto usa. Se o webhook do Meta enviar o
outro em `entry[].id`, nenhuma automação casa e o sistema fica inerte sem erro.
Confira na tela de Logs se os eventos chegam mas nada dispara.

---

## 4. Depois do deploy

### O Meta nunca alcança seu webhook (Proteção de Deploy da Vercel)

**Vê:** o Meta recusa a Callback URL, ou aceita mas nenhum evento chega nunca. A
seção "Eventos recebidos" da tela de Logs fica permanentemente vazia.

**Causa:** a Vercel liga **Vercel Authentication** por padrão em projetos novos.
Toda requisição é redirecionada para `vercel.com/sso-api` e exige um usuário
logado na Vercel. O Meta não tem como autenticar nisso.

**Como confirmar:** teste o handshake de fora e veja o que responde.

```bash
curl -i "https://SEU-APP.vercel.app/api/webhook?hub.mode=subscribe&hub.verify_token=SEU_VERIFY_TOKEN&hub.challenge=12345"
```

Esperado quando está tudo certo: `HTTP 200` e o corpo `12345`, cru.
Se vier `HTTP 302` com `Location: https://vercel.com/sso-api?...`, é a proteção.

**Solução:** no painel da Vercel → projeto → **Settings** → **Deployment
Protection** → desative **Vercel Authentication** para **Production**.

Pode manter para Preview. Desativar não expõe nada: o painel segue atrás da
`PANEL_PASSWORD` e o webhook segue validando assinatura HMAC.

**Por que é traiçoeira:** não vem do Meta nem do seu código. Tudo parece
configurado corretamente, o deploy diz "Ready", e a falha é silenciosa. A
suspeita natural recai sobre o código, que está certo.

---

### Use a URL estável, não a do deploy

O comando de deploy imprime uma URL com um hash, tipo
`meu-app-mp9f31xau-usuario.vercel.app`. **Essa muda a cada publicação.** Se você
colar ela no webhook do Meta, tudo para de funcionar no próximo deploy.

Use a URL estável do projeto, no formato `meu-app-usuario.vercel.app` — ela
aponta sempre para o deploy de produção atual.

---

### "O Meta recusa minha Callback URL"

**Causa:** o `VERIFY_TOKEN` no ambiente do deploy é diferente do que você digitou
no portal, ou o deploy ainda não terminou.

**Solução:** a tela de Configuração do painel mostra o Verify Token que o
servidor está realmente usando. Copie de lá, não da memória.

### "Configurei o webhook mas não chega evento nenhum"

**Vê:** na tela de Logs, a seção "Eventos recebidos" fica vazia mesmo você
comentando no Reel.

**Causa 1:** os campos não foram assinados. Precisa marcar `comments`,
`messages`, `messaging_postbacks`, `messaging_seen`.

**Causa 2:** o app precisa estar com status **publicado**. A própria tela de
configuração de webhooks avisa isso: "Seu app deve estar com o status de
publicado para receber webhooks."

**Como distinguir de outros problemas:** se a seção "Eventos recebidos" está
vazia, o problema é a configuração do webhook no portal. Se chegam eventos mas
não há disparos, o problema é a automação.

### "Chega evento mas nenhuma DM é enviada"

**Verifique, nesta ordem:**

1. A automação está **Publicada**? Rascunho não dispara.
2. A palavra-chave casa? O casamento ignora acento e maiúscula, mas o modo
   `exato` exige o comentário ser só a palavra.
3. Você comentou com a **própria conta**? O anti-loop ignora comentários da
   conta dona da automação, de propósito. Teste com outra conta.
4. Essa pessoa já recebeu essa automação antes? Cada pessoa recebe uma vez só.
5. A tela de Logs mostra o erro exato do Meta em cada disparo — leia ali.

### "Erro #10" nos logs

**Causa:** tentativa de enviar uma segunda mensagem para a mesma pessoa fora da
janela de 24 horas.

**Nota:** o sistema foi construído para não fazer isso — o pedido de follow e o
link vão na **mesma** private reply. Se esse erro aparecer, algo está tentando
mandar mensagem em sequência.

### "Funciona comigo mas não com outra pessoa"

**Causa:** modo dev. Só contas com a função **Testador do Instagram** no seu app
recebem.

**Solução:** para atender qualquer seguidor é preciso passar pelo **App Review**
do Meta e obter Advanced Access. É trabalho de formulário e screencast, não de
código, e leva de dias a semanas.

**Para o workshop isso não é bloqueio:** cada pessoa cria o próprio app e testa
na própria conta. Modo dev cobre até 25 test users e nenhuma revisão é
necessária.

---

## 5. Defeitos encontrados no próprio código

Registrados porque a skill instaladora precisa não reintroduzi-los.

### Regex de acentos com caracteres literais

`normalize()` precisa usar `/[̀-ͯ]/g` com **escapes**. Escrito com os
caracteres combinantes literais, eles são invisíveis no editor e não sobrevivem
a cópia entre arquivos. Se quebrarem, `PREÇO` deixa de casar com `preco` e a
automação não dispara para quem escreve com acento — sem erro nenhum.

### `markWebhookProcessed` fora do try/catch

Se essa chamada falhar, o handler devolve 500 **depois** de a DM já ter sido
enviada. O Meta reentrega o evento e a pessoa recebe a mensagem duplicada. Todo
o corpo do POST precisa ser resiliente: sempre 200, exceto assinatura inválida
(401).

### `saveAutomation` sem transação

Apagar os passos e reinserir em chamadas HTTP separadas deixa a automação sem os
passos antigos e com só parte dos novos se um insert falhar. Precisa de
`sql.transaction([...])`.

### Publicar automação com DM vazia

O painel permite publicar sem texto de DM. A automação fica com aparência de
ativa e nunca envia nada, sem erro. Conhecido, não corrigido — vale avisar quem
estiver montando.

---

## 6. O que o tutorial de origem errou

Útil como conteúdo de aula. O reel do tutorial que serviu de ponto de partida
para este projeto está desatualizado ou errado em:

1. **Sequência de várias DMs** (passo 07) — não dispara. Uma segunda mensagem
   cai fora da janela de 24h e retorna erro #10. Follow e link vão juntos, na
   mesma private reply.
2. **Escopos antigos** — `instagram_manage_messages` e
   `instagram_manage_comments` foram descontinuados em 27/01/2025. Use
   `instagram_business_*`.
3. **"Ferramentas → Explorador de Graph API"** para gerar o token — não serve
   neste fluxo. O Explorador gera token da API com login do **Facebook**
   (`graph.facebook.com`), outro host e outros escopos. A nossa é a API com
   login do **Instagram** (`graph.instagram.com`), cujo token só sai pelo fluxo
   OAuth dentro do caso de uso.
4. **Não menciona o webhook** — sem ele o Instagram nunca avisa seu servidor, e
   nada dispara. É a peça mais importante e a que o vídeo omite.
5. **Não menciona token de longa duração** — o token inicial morre em ~1 hora.
