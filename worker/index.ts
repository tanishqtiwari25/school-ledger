import {accessIdentity,withVerifiedIdentity} from "./access-auth";
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    if(env.AUTH_PROVIDER==='cloudflare-access'){
      let identity;
      try{identity=await accessIdentity(request,env);}catch{return new Response('Secure sign-in is not configured. Contact the school administrator.',{status:503,headers:{'Cache-Control':'no-store'}});}
      if(!identity)return new Response('Sign in through Cloudflare Access to continue.',{status:401,headers:{'Cache-Control':'no-store'}});
      const path=new URL(request.url).pathname;
      if(path==='/signout-with-chatgpt')return Response.redirect(new URL('/cdn-cgi/access/logout',request.url),303);
      if(path==='/signin-with-chatgpt')return Response.redirect(new URL('/',request.url),303);
      request=withVerifiedIdentity(request,identity);
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
};

export default worker;
