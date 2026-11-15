const SECTIONS = {
  privacy: {
    title: "Privacidade",
    items: [
      ["O que coletamos", "Só ao entrar com Twitch ou Google: nome, e-mail, foto de perfil e o ID da conta, fornecidos pelo próprio serviço. Guardamos também as cartas que você resgatou."],
      ["Para que usamos", "Para manter você logado e mostrar sua coleção. Não vendemos, não compartilhamos e não usamos para anúncios."],
      ["Cookies", "Usamos apenas cookies essenciais de sessão para o login. Não há cookies de rastreamento nem analytics."],
      ["Onde fica", "Os dados ficam na Cloudflare, que hospeda o site. Estatísticas de jogo vêm da API pública deadlock-api."],
      ["Seus direitos (LGPD)", "Você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento abrindo uma issue no GitHub do projeto."],
    ],
  },
  terms: {
    title: "Termos de uso",
    items: [
      ["O projeto", "Deadlock Cards é um projeto de fã, gratuito e feito por diversão. Não é afiliado à Valve nem ao Deadlock."],
      ["Cartas", "As cartas são colecionáveis digitais sem valor monetário. Não podem ser vendidas nem trocadas por dinheiro."],
      ["Uso justo", "Não tente burlar códigos de resgate, automatizar acessos ou atrapalhar o site. Contas que fizerem isso podem ser removidas."],
      ["Sem garantias", "O site é oferecido como está e pode mudar, ficar fora do ar ou ser encerrado a qualquer momento."],
      ["Mudanças", "Estes termos podem ser atualizados. Usar o site depois de uma mudança significa aceitar a nova versão."],
    ],
  },
};

export function Legal({ page }: { page: keyof typeof SECTIONS }) {
  const { title, items } = SECTIONS[page];
  return (
    <article className="max-w-2xl mx-auto noir-glass rounded-2xl border border-zinc-200/15 p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold uppercase tracking-wider text-zinc-100">{title}</h1>
      <p className="mt-1 text-xs text-zinc-500">Atualizado em 15/11/2026</p>
      {items.map(([h, p]) => (
        <section key={h} className="mt-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-200">{h}</h2>
          <p className="mt-1 text-sm text-zinc-400 leading-relaxed">{p}</p>
        </section>
      ))}
    </article>
  );
}
