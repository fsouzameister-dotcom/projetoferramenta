/** Carrega o Facebook JS SDK uma vez e inicializa com o App ID. */

declare global {
  interface Window {
    FB?: {
      init: (opts: {
        appId: string;
        cookie?: boolean;
        xfbml?: boolean;
        version: string;
      }) => void;
      login: (
        cb: (response: {
          authResponse?: { code?: string; accessToken?: string };
          status?: string;
        }) => void,
        opts: Record<string, unknown>
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

let loadPromise: Promise<void> | null = null;

export function loadFacebookSdk(appId: string, graphVersion: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("SDK só no browser"));
  }
  if (window.FB) {
    window.FB.init({
      appId,
      cookie: true,
      xfbml: false,
      version: graphVersion.startsWith("v") ? graphVersion : `v${graphVersion}`,
    });
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const version = graphVersion.startsWith("v") ? graphVersion : `v${graphVersion}`;
    window.fbAsyncInit = () => {
      try {
        window.FB?.init({
          appId,
          cookie: true,
          xfbml: false,
          version,
        });
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    const existing = document.getElementById("facebook-jssdk");
    if (existing) return;
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Falha ao carregar Facebook SDK"));
    };
    document.body.appendChild(script);
  });
  return loadPromise;
}

export type EmbeddedSignupSessionData = {
  phone_number_id?: string;
  waba_id?: string;
  business_id?: string;
};

export type EmbeddedSignupMessage = {
  type?: string;
  event?: string;
  data?: EmbeddedSignupSessionData;
};

export function launchWhatsAppEmbeddedSignup(configId: string): Promise<{
  code: string;
  session: EmbeddedSignupSessionData;
}> {
  return new Promise((resolve, reject) => {
    if (!window.FB) {
      reject(new Error("Facebook SDK não inicializado"));
      return;
    }

    let session: EmbeddedSignupSessionData = {};
    const onMessage = (event: MessageEvent) => {
      try {
        const raw = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        const msg = raw as EmbeddedSignupMessage;
        if (msg?.type === "WA_EMBEDDED_SIGNUP") {
          if (msg.event === "FINISH" || msg.event === "FINISH_ONLY_WABA" || msg.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
            session = msg.data ?? {};
          }
        }
      } catch {
        /* ignore non-JSON */
      }
    };
    window.addEventListener("message", onMessage);

    window.FB.login(
      (response) => {
        window.removeEventListener("message", onMessage);
        const code = response.authResponse?.code;
        if (!code) {
          reject(new Error("Login cancelado ou sem authorization code"));
          return;
        }
        if (!session.waba_id || !session.phone_number_id) {
          reject(
            new Error(
              "Fluxo concluído sem waba_id/phone_number_id. Confira o Config ID e o domínio allowlisted."
            )
          );
          return;
        }
        resolve({ code, session });
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: "",
          sessionInfoVersion: "3",
        },
      }
    );
  });
}
