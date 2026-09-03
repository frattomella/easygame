/**
 * Guscio HTML condiviso per le email EasyGame.
 *
 * Prima ogni chiamata costruiva la propria stringa HTML, senza logo e senza
 * identita visiva. Qui l'unica cosa che cambia da un'email all'altra e
 * `bodyHtml`: intestazione, piede pagina e URL del logotipo restano fissi.
 *
 * Il logotipo va servito da un URL assoluto: i client di posta non caricano
 * percorsi relativi ne componenti React, solo un <img src> raggiungibile.
 * `NEXT_PUBLIC_APP_URL` e lo stesso valore usato per i link di reset
 * password (vedi `getAppBaseUrl` in `auth-workflows.ts`), duplicato qui per
 * non introdurre un accoppiamento tra i due moduli.
 */
const getEmailAssetBaseUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001").replace(
    /\/+$/,
    "",
  );

/** Logotipo blu: le email hanno sempre sfondo chiaro. */
export const getEmailLogoUrl = () =>
  `${getEmailAssetBaseUrl()}/images/brand/logotipo-b.png`;

export const renderEmailLayout = ({
  bodyHtml,
}: {
  bodyHtml: string;
}): string => `
  <div style="background:#f8fafc;padding:32px 16px;font-family:Arial, sans-serif;">
    <div style="max-width:560px;margin:0 auto;">
      <div style="padding-bottom:24px;">
        <img src="${getEmailLogoUrl()}" alt="EasyGame" width="140" height="28" style="display:block;border:0;" />
      </div>
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;color:#0f172a;">
        ${bodyHtml}
      </div>
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">EasyGame</p>
    </div>
  </div>
`;
