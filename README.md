# MEUCHAT

MEUCHAT é uma automação de comentário para DM no Instagram: quem
comenta uma palavra-chave no seu post recebe uma resposta pública na hora e,
em seguida, uma mensagem privada com o seu link. Ela roda de graça, na sua
própria conta da Vercel e do Neon — não numa plataforma paga de terceiros.
Você configura tudo depois, por um painel, sem escrever código.

## Publicar agora

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frafaneaime%2Frafa-automacao&project-name=adeus-mensalidade&repository-name=adeus-mensalidade&env=IG_APP_ID%2CIG_APP_SECRET%2CVERIFY_TOKEN%2CACCESS_TOKEN%2CPANEL_PASSWORD%2CEMAIL_CONTATO&envDescription=As+credenciais+do+app+do+Instagram+e+a+senha+do+seu+painel.+Veja+onde+encontrar+cada+uma+na+se%C3%A7%C3%A3o+Antes+de+clicar%2C+no+README.&envLink=https%3A%2F%2Fgithub.com%2Frafaneaime%2Frafa-automacao%23antes-de-clicar&products=%5B%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22storage%22%2C%22productSlug%22%3A%22neon%22%2C%22integrationSlug%22%3A%22neon%22%7D%5D)

Clicar cria a sua própria cópia do projeto, hospedada na sua conta — não na
minha. Antes de clicar, leia os pré-requisitos abaixo: leva dois minutos e
evita ter que refazer passo por falta de alguma conta.

## Antes de clicar

Você vai precisar destas contas. Todas são gratuitas para o que este projeto
usa.

- **Conta no GitHub** ([github.com/join](https://github.com/join)) — é onde
  fica guardada a sua cópia do projeto depois que você clica no botão.
- **Conta na Vercel** ([vercel.com/signup](https://vercel.com/signup)) — é
  quem hospeda o site de graça. Dá para entrar direto com o GitHub, sem criar
  senha nova.
- **Conta no Neon** ([neon.tech](https://neon.tech)) — é o banco de dados
  onde ficam salvas as suas automações. O próprio botão de publicar já
  conecta os dois; você só precisa ter a conta criada.
- **Conta no Meta for Developers**
  ([developers.facebook.com](https://developers.facebook.com)) — é onde você
  cria o "aplicativo" que autoriza o Instagram a conversar com o seu projeto.
  Usa o seu login normal do Instagram/Facebook.
- **Uma conta do Instagram configurada como Business ou Creator.** Conta
  pessoal comum não funciona aqui — é nela que a automação vai rodar.
- **Duas contas do Instagram, não uma.** Por segurança, o sistema ignora
  comentários feitos pela própria conta que está rodando a automação, para
  não entrar em loop de mensagens. Sem uma segunda conta para comentar, você
  não tem como testar se está funcionando.

O formulário da Vercel vai pedir estas variáveis. É aqui que cada uma vem:

| Variável | Onde encontrar |
|---|---|
| `IG_APP_ID` e `IG_APP_SECRET` | O ID e a chave secreta do app do **Instagram** — ficam no bloco do topo da página **Configuração da API com login do Instagram** (Casos de uso → Personalizar). **Não** são os de Configurações do app → Básico: esses são do app do **Facebook**, e usá-los faz todo evento chegar com assinatura inválida, sem nenhum erro visível até a produção. |
| `ACCESS_TOKEN` | O token gerado no passo 2 dessa mesma página. |
| `VERIFY_TOKEN` | Uma string secreta que você mesmo inventa; o mesmo valor entra depois no portal do Meta. |
| `PANEL_PASSWORD` | Uma senha que você mesmo inventa, para entrar no seu próprio painel. |
| `EMAIL_CONTATO` | Um e-mail seu, que você realmente acompanhe. Ele aparece na política de privacidade do seu app, para quem quiser pedir a remoção dos próprios dados — e o Meta exige essa política para deixar você publicar. |

## Comece pela página-guia

**→ [adeus-guia.vercel.app](https://adeus-guia.vercel.app)**

Este README não repete o passo a passo — ele é só a porta de entrada. O caminho
completo, com cada tela e cada clique, está na página-guia: dezesseis passos com
caixinhas para você ir marcando, o progresso salvo no seu navegador, e os avisos
das armadilhas aparecendo dentro do passo em que cada uma ataca.

Comece por ela. É o que leva você do zero até a primeira DM automática.

## A verdade sobre o modo de testes

Assim que você publica, a automação já funciona — mas, no começo, só para
contas cadastradas como "Testador do Instagram" dentro do seu próprio
aplicativo (a página-guia mostra exatamente onde cadastrar a sua). Para que
**qualquer** seguidor comum receba a DM, o Meta exige uma revisão chamada App
Review: um formulário e um vídeo curto mostrando cada permissão em uso. Não é
um passo de código — é uma aprovação do lado do Meta, e ela leva de alguns
dias a algumas semanas.

## Por que o link vai junto da mensagem

Vídeos populares sobre esse tipo de automação ensinam a mandar uma sequência
de mensagens: primeiro um "oi", depois um pedido para seguir, só depois o
link. Essa sequência **não funciona** aqui, e não é bug do projeto: mensagens
de acompanhamento só funcionam depois que a pessoa responde — é isso que abre
de verdade a janela de 24 horas do Meta. Uma segunda mensagem mandada fora
dessa janela é recusada com o erro #10. Por isso a DM daqui já entrega tudo de
uma vez — o pedido e o link, juntos, na mesma mensagem.

## Deu problema?

Antes de mais nada, veja
[`docs/troubleshooting.md`](docs/troubleshooting.md). É uma lista de erros
reais que já apareceram durante a montagem deste projeto, organizada pelo que
aparece na sua tela — "não encontro o Instagram no menu", "erro #10",
"assinatura inválida" — com a causa e a solução de cada um.
