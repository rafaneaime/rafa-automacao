export const runtime = 'nodejs';

export default function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-neutral-800">
      <div className="mb-8 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Aviso para quem operar esta instalação:</strong> revise todo o
        texto abaixo antes de publicar o app no Meta. Em especial, troque o
        e-mail de contato marcado como{' '}
        <code className="rounded bg-amber-100 px-1 py-0.5">
          [SUBSTITUA PELO SEU E-MAIL]
        </code>{' '}
        pelo endereço que você realmente vai monitorar.
      </div>

      <h1 className="mb-2 text-2xl font-semibold">Política de Privacidade</h1>
      <p className="mb-8 text-sm text-neutral-500">
        Última atualização: preencha a data em que você publicou esta
        instalação.
      </p>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">O que esta aplicação faz</h2>
        <p className="text-sm leading-relaxed text-neutral-700">
          Esta aplicação é uma automação de respostas para o Instagram: quando
          alguém comenta em uma publicação do operador desta conta ou envia
          uma mensagem direta, e o conteúdo casa com uma palavra-chave
          configurada, a aplicação envia automaticamente uma resposta (no
          comentário, por mensagem privada, ou ambos). Ela roda a partir de
          uma única instalação, conectada a uma conta do Instagram por vez.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">Quais dados são coletados</h2>
        <p className="mb-2 text-sm leading-relaxed text-neutral-700">
          Quando alguém comenta em uma publicação ou envia uma DM para a
          conta conectada, a aplicação armazena:
        </p>
        <ul className="mb-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-neutral-700">
          <li>
            o ID de usuário do Instagram e, quando disponível, o nome de
            usuário (username) de quem comentou ou enviou a mensagem;
          </li>
          <li>o texto do comentário ou da mensagem recebida;</li>
          <li>
            um registro de quais mensagens automáticas foram enviadas, para
            quem e quando (incluindo status de envio, como sucesso, erro ou
            bloqueio por limite de taxa);
          </li>
          <li>
            o payload bruto de cada notificação (webhook) recebida do Meta,
            para fins de diagnóstico e depuração.
          </li>
        </ul>
        <p className="text-sm leading-relaxed text-neutral-700">
          Não é coletado nenhum dado além do que chega através da própria API
          do Instagram nesses eventos — não há rastreamento em outras partes
          do Instagram, em outros sites, nem coleta por formulários externos.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">Por que esses dados são usados</h2>
        <p className="text-sm leading-relaxed text-neutral-700">
          Os dados são usados exclusivamente para: (1) enviar a resposta
          automática que a própria pessoa provocou ao comentar ou mandar
          mensagem, e (2) evitar enviar a mesma resposta mais de uma vez para
          a mesma pessoa. Os dados não são usados para propaganda, não são
          analisados para perfis de comportamento, e não são vendidos ou
          repassados a terceiros.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">Onde os dados ficam armazenados</h2>
        <p className="text-sm leading-relaxed text-neutral-700">
          Os dados ficam em um banco de dados Postgres controlado pelo
          operador desta instalação (quem fez o deploy desta aplicação). Esse
          banco não é compartilhado com terceiros e não é acessado pelo autor
          do software — apenas pelo operador que administra a própria
          instalação.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">Por quanto tempo os dados ficam guardados</h2>
        <p className="text-sm leading-relaxed text-neutral-700">
          Esta aplicação não exclui dados automaticamente. Os registros de
          contatos, comentários, mensagens e envios ficam armazenados até que
          o operador os apague manualmente do banco de dados. Não há uma
          política de retenção automática implementada no software.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">Quem é o responsável por esses dados</h2>
        <p className="text-sm leading-relaxed text-neutral-700">
          Quem controla os dados coletados por esta instalação é a pessoa ou
          empresa que fez o deploy desta aplicação e opera a conta do
          Instagram conectada a ela — não o autor do software. Este é um
          material de código aberto usado por múltiplas pessoas de forma
          independente; cada instalação (cada deploy) é operada de forma
          separada, com seu próprio banco de dados e sua própria conta do
          Instagram. Se você chegou a esta página a partir de um app
          específico do Meta, o responsável pelos seus dados é quem opera
          aquele app, identificado no contato abaixo.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">Papel do Meta / Instagram</h2>
        <p className="text-sm leading-relaxed text-neutral-700">
          Os dados chegam a esta aplicação através da API do Instagram
          (Meta), por meio de webhooks configurados na Plataforma Meta para
          Desenvolvedores. O uso dessa API está sujeito aos termos e às
          políticas de dados do próprio Meta, além desta política. Esta
          aplicação não tem controle sobre como o Meta processa os dados
          antes de entregá-los via webhook.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">Seus direitos</h2>
        <p className="text-sm leading-relaxed text-neutral-700">
          Se você comentou ou enviou uma mensagem para a conta conectada a
          esta instalação e quer solicitar a remoção dos seus dados (ID de
          usuário, username, textos armazenados e histórico de envios), entre
          em contato com o operador pelo e-mail abaixo. O pedido será
          atendido apagando os registros correspondentes no banco de dados.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Contato</h2>
        <p className="text-sm leading-relaxed text-neutral-700">
          Para dúvidas sobre esta política ou para solicitar a remoção dos
          seus dados, entre em contato com o operador desta instalação em:{' '}
          <strong>[SUBSTITUA PELO SEU E-MAIL]</strong>.
        </p>
      </section>
    </main>
  );
}
