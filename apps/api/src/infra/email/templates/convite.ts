interface DadosConvite {
  mesaNome: string;
  nomeMestre: string;
  urlConvite: string;
}

export function templateConvite(dados: DadosConvite): { assunto: string; html: string } {
  return {
    assunto: `🎲 ${dados.nomeMestre} convidou você para a mesa "${dados.mesaNome}" no RolaVinte`,
    html: `
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #131a26; color: #e8e6e3; border-radius: 12px; padding: 32px;">
  <h1 style="color: #e8b64c; font-size: 22px; margin: 0 0 8px;">🎲 RolaVinte</h1>
  <p style="font-size: 16px; line-height: 1.6;">
    <strong>${dados.nomeMestre}</strong> convidou você para jogar na mesa
    <strong>"${dados.mesaNome}"</strong>.
  </p>
  <p style="text-align: center; margin: 28px 0;">
    <a href="${dados.urlConvite}"
       style="background: #e8b64c; color: #131a26; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; display: inline-block;">
      Aceitar convite
    </a>
  </p>
  <p style="font-size: 13px; color: #9aa3b2; line-height: 1.5;">
    O convite é pessoal e de uso único. Se você não esperava este email, pode ignorá-lo.
  </p>
</div>`.trim(),
  };
}
