import Script from "next/script";
import { isAutomated } from "@/lib/track";

/** PostHog product analytics (the self-hosted instance).

    Env-gated on NEXT_PUBLIC_POSTHOG_KEY: with the variable unset or empty this
    renders nothing, so local and CI builds load no PostHog and send no event.
    The project key is public, but like every NEXT_PUBLIC_* value it is inlined
    at build time — the image has to be rebuilt to change it.

    The snippet is PostHog's official loader stub, kept verbatim: it defines
    window.posthog, queues calls, and injects /static/array.js from the api
    host. The api host is /_t/n4q on anotifier.io itself, which nginx.conf
    forwards to the self-hosted instance, so blocklists that match PostHog
    hostnames don't drop the events (NEXT_PUBLIC_POSTHOG_HOST overrides it;
    ui_host keeps toolbar links on posthog.devino.ca). It runs lazyOnload, after the page's load event, so the ~100 KB
    library never competes with the fonts, CSS and hero image (the same reason
    gtag.js loads lazyOnload). `defaults: "2025-11-30"` captures a pageview on
    every client-side navigation, not just the first load. Anonymous visitors
    get no person profile (`identified_only`); the site never identifies anyone.

    It sends pageviews, the site's own track() events and session recordings,
    nothing else. Autocapture, heatmaps, dead clicks, exceptions, web vitals,
    network performance, $pageleave and surveys are switched off in code,
    whatever the PostHog project enables.

    Session recording is on, sampled SERVER-SIDE at 10%: the sample rate is the
    project's recording sampling setting in PostHog, not code, so changing it
    needs no rebuild. The recorder script loads from /_t/n4q/static/... through
    the same nginx proxy as everything else. Inputs are always masked
    (maskAllInputs), text inside .ph-sensitive is masked and anything inside
    .ph-no-capture is blocked from the recording. The rest of the page is
    public marketing copy with no user data. Sentry replay
    (components/SentryReplay.tsx) records the same way, sampled separately.
    Automated browsers (isAutomated in lib/track.ts: WebDriver, headless, the
    site tests, an 800x600 screen) never define window.posthog, so their visits
    and the track() calls they make send nothing.
    app/privacy/page.tsx describes all of this in plain words; change the two
    together. */
export default function PostHog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) {
    return null;
  }
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "/_t/n4q";

  return (
    <Script id="posthog" strategy="lazyOnload">
      {`if(!(${isAutomated.toString()})()){!function(t,e){var o,n,p,r;e.__SV||(window.posthog&&window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init(${JSON.stringify(key)}, {api_host: ${JSON.stringify(host)}, ui_host: "https://posthog.devino.ca", defaults: "2025-11-30", person_profiles: "identified_only", autocapture: false, session_recording: {maskAllInputs: true, maskTextSelector: ".ph-sensitive", blockSelector: ".ph-no-capture"}, enable_heatmaps: false, capture_dead_clicks: false, capture_exceptions: false, capture_performance: false, capture_pageleave: false, disable_surveys: true});}`}
    </Script>
  );
}
