import { PaymentError, assertAmount, type AdapterDeps, type CheckoutRequest, type CheckoutResult, type PaymentAdapter, type PaymentEnv, type VerifyResult } from '../types.ts';
import { assertSandboxMode, SANDBOX_HOSTS } from '../sandbox.ts';

/**
 * DPO Pay (Network International) API v6, XML — STUB alternate. createToken → redirect to payv2 → verifyToken.
 * DPO uses ONE endpoint for test and live; the company token decides. So this adapter refuses to run unless
 * DPO_SANDBOX === 'true' AND a DPO_COMPANY_TOKEN from DPO's published sandbox list is set.
 * Docs: docs.dpopay.com/dpo-pay-by-network/reference/sandbox-test-credentials · /create-token
 */
const xmlEsc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));
const tag = (xml: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1];

export const dpoAdapter: PaymentAdapter = {
  code: 'dpo',
  displayName: 'DPO Pay',
  methods: ['mtn_momo', 'airtel_money', 'card'],
  status: 'stub',
  assertSandbox(env: PaymentEnv) {
    assertSandboxMode(env);
    if (env.DPO_SANDBOX !== 'true') throw new PaymentError('live_refused', 'DPO shares one host for test and live: set DPO_SANDBOX=true with a sandbox company token');
    if (!env.DPO_COMPANY_TOKEN || !env.DPO_SERVICE_TYPE) throw new PaymentError('not_configured', 'DPO sandbox token is not configured');
  },
  async createCheckout(req: CheckoutRequest, deps: AdapterDeps): Promise<CheckoutResult> {
    this.assertSandbox(deps.env); assertAmount(req.amountUgx);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/') + ' 00:00';
    const body = `<?xml version="1.0" encoding="utf-8"?><API3G><CompanyToken>${xmlEsc(deps.env.DPO_COMPANY_TOKEN!)}</CompanyToken><Request>createToken</Request>`
      + `<Transaction><PaymentAmount>${req.amountUgx}</PaymentAmount><PaymentCurrency>UGX</PaymentCurrency><CompanyRef>${xmlEsc(req.txRef)}</CompanyRef>`
      + `<RedirectURL>${xmlEsc(req.redirectUrl)}</RedirectURL><BackURL>${xmlEsc(req.redirectUrl)}</BackURL><customerEmail>${xmlEsc(req.customer.email)}</customerEmail></Transaction>`
      + `<Services><Service><ServiceType>${xmlEsc(deps.env.DPO_SERVICE_TYPE!)}</ServiceType><ServiceDescription>${xmlEsc(req.description.slice(0, 100))}</ServiceDescription><ServiceDate>${today}</ServiceDate></Service></Services></API3G>`;
    const r = await deps.fetch(SANDBOX_HOSTS.dpo, { method: 'POST', headers: { 'content-type': 'application/xml; charset=utf-8', accept: 'application/xml' }, body });
    const xml = await r.text();
    const tok = tag(xml, 'TransToken');
    if (!r.ok || tag(xml, 'Result') !== '000' || !tok) throw new PaymentError('upstream', `DPO: ${tag(xml, 'ResultExplanation') ?? r.status}`);
    return { kind: 'redirect', url: `https://secure.3gdirectpay.com/payv2.php?ID=${encodeURIComponent(tok)}`, providerRef: tok, sandbox: true };
  },
  async verify(_txRef: string, deps: AdapterDeps): Promise<VerifyResult> {
    this.assertSandbox(deps.env);
    throw new PaymentError('not_implemented', 'DPO verifyToken needs the TransToken stored at checkout (stub)');
  },
};
