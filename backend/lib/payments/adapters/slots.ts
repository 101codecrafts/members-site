import { PaymentError, type PaymentAdapter, type PaymentEnv } from '../types.ts';
import { assertSandboxMode } from '../sandbox.ts';

/**
 * Adapter SLOTS: registered so the admin can see them and the interface is fixed, but they refuse to run.
 *  - mtn_momo: MTN MoMo Open API direct (Collections requesttopay). Sandbox: sandbox.momodeveloper.mtn.com,
 *    X-Target-Environment: sandbox, currency EUR in sandbox. Needs subscription key + API user/key.
 *  - airtel_money: Airtel Africa Open API (/merchant/v1/payments/), UAT host openapiuat.airtel.africa.
 *  - payway: "Payway" — most likely PayWay Uganda (African Vending Systems, payway.ug). Merchant API docs are not
 *    public; ASK THE FOUNDER which Payway he means and get test credentials before building.
 */
function slot(code: PaymentAdapter['code'], displayName: string, status: PaymentAdapter['status'], methods: PaymentAdapter['methods'], why: string): PaymentAdapter {
  const refuse = (env: PaymentEnv) => { assertSandboxMode(env); throw new PaymentError('not_implemented', `${displayName}: ${why}`); };
  return {
    code, displayName, methods, status,
    assertSandbox: refuse,
    async createCheckout(_r, deps) { refuse(deps.env); throw new Error('unreachable'); },
    async verify(_t, deps) { refuse(deps.env); throw new Error('unreachable'); },
  };
}

export const mtnMomoAdapter = slot('mtn_momo', 'MTN MoMo (direct)', 'stub', ['mtn_momo'], 'direct MTN Open API not enabled; Flutterwave carries MTN MoMo today');
export const airtelMoneyAdapter = slot('airtel_money', 'Airtel Money (direct)', 'stub', ['airtel_money'], 'direct Airtel Open API not enabled; Flutterwave carries Airtel Money today');
export const paywayAdapter = slot('payway', 'Payway', 'planned', ['mtn_momo', 'airtel_money', 'card', 'wallet'], 'waiting on the founder: which Payway, and its merchant API + test credentials');
