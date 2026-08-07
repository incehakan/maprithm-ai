/**

 * Hepsiburada Satıcıya Sor (Ask to Seller) — ASKTOSELLER base.

 *

 * SIT listesiyle doğrulandı (03.08.2026).

 * Prod domain TAHMİNİ (`ASKTOSELLER`).

 *

 * AUTH TODO: Bu servis `api-` önekli farklı bir domain ailesi — Basic Auth

 * dışında kimlik doğrulama kullanıyor olabilir. İlk gerçek çağrıda 401

 * alınırsa `hbFetch`/`hbPostJson` için servise özel header araştırılmalı.

 * Şimdilik mevcut Basic Auth katmanı deneniyor.

 *

 * Not (Lonca): bazı açık kaynak SDK'lar aynı path'leri OMS host'una bağlar;

 * bu repoda SIT URL listesindeki ASKTOSELLER host kullanılır.

 */



import {

  getHbEnvironment,

  hbFetch,

  hbPostJson,

} from "@/lib/hepsiburadaFetch";

import { logger } from "@/lib/logger";



type HbSimpleResult =

  | { ok: true; data: unknown }

  | { ok: false; message: string };



/**

 * Method: GET

 * Path: /api/v1.0/issues

 * SIT listesiyle doğrulandı (03.08.2026).

 */

export async function fetchHbAskToSellerIssues(params: {

  storeId: string;

  query?: Record<string, string>;

}): Promise<HbSimpleResult> {

  try {

    const qs = new URLSearchParams(params.query ?? {});

    const q = qs.toString();

    const path = `/api/v1.0/issues${q ? `?${q}` : ""}`;

    const res = await hbFetch(params.storeId, "ASKTOSELLER", path);

    if (!res.ok) return { ok: false, message: res.message };

    return { ok: true, data: res.data };

  } catch (err) {

    const message = err instanceof Error ? err.message : "issues list hatası.";

    logger.error("hb_asktoseller_issues_failed", { message });

    return { ok: false, message };

  }

}



/**

 * SIT-only test sorusu oluşturma payload'ı.

 * Tipik alanlar: `{ productSku, question }` — canlı SIT ile henüz TEYİT EDİLMEDİ.

 */

export type HbTestQuestionPayload = Record<string, unknown>;



/**

 * Method: POST

 * Path: /api/v1.0/issues

 *

 * GET listeden AYRI: yalnızca SIT'te çalışan "test sorusu oluşturma"

 * (doküman: soru-oluşturma). Production'da çağrı reddedilir.

 *

 * Resmi dokümantasyondan doğrulandı (2026-08-03) — path/amaç;

 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.

 */

export async function createHbTestQuestion(params: {

  storeId: string;

  payload: HbTestQuestionPayload;

}): Promise<HbSimpleResult> {

  try {

    const env = await getHbEnvironment(params.storeId);

    if (env !== "test") {

      return {

        ok: false,

        message:

          "Test sorusu oluşturma yalnızca SIT ortamında kullanılabilir.",

      };

    }



    const res = await hbPostJson(

      params.storeId,

      "ASKTOSELLER",

      "/api/v1.0/issues",

      params.payload

    );

    if (!res.ok) return { ok: false, message: res.message };



    logger.info("hb_test_question_created", { storeId: params.storeId });

    return { ok: true, data: res.data };

  } catch (err) {

    const message =

      err instanceof Error ? err.message : "Test sorusu oluşturma hatası.";

    logger.error("hb_create_test_question_failed", { message });

    return { ok: false, message };

  }

}



/**

 * @deprecated POST /issues artık `createHbTestQuestion` (SIT-only).

 * Eski isim yanlışlıkla "answer" çağrıştırıyordu; cevap için

 * `answerHbAskToSellerIssue` kullanın.

 */

export async function createHbAskToSellerAnswer(): Promise<never> {

  throw new Error(

    "createHbAskToSellerAnswer kaldırıldı. SIT test sorusu için " +

      "createHbTestQuestion kullanın; cevap için answerHbAskToSellerIssue."

  );

}



/**

 * Method: GET

 * Path: /api/v1.0/issues/count

 * SIT listesiyle doğrulandı (03.08.2026).

 */

export async function fetchHbAskToSellerIssuesCount(params: {

  storeId: string;

}): Promise<HbSimpleResult> {

  try {

    const res = await hbFetch(params.storeId, "ASKTOSELLER", "/api/v1.0/issues/count");

    if (!res.ok) return { ok: false, message: res.message };

    return { ok: true, data: res.data };

  } catch (err) {

    const message = err instanceof Error ? err.message : "issues count hatası.";

    logger.error("hb_asktoseller_count_failed", { message });

    return { ok: false, message };

  }

}



/**

 * Method: GET

 * Path: /api/v1.0/issues/{number}

 * SIT listesiyle doğrulandı (03.08.2026).

 */

export async function fetchHbAskToSellerIssueByNumber(params: {

  storeId: string;

  number: string;

}): Promise<HbSimpleResult> {

  try {

    const number = params.number.trim();

    if (!number) return { ok: false, message: "number zorunludur." };

    const path = `/api/v1.0/issues/${encodeURIComponent(number)}`;

    const res = await hbFetch(params.storeId, "ASKTOSELLER", path);

    if (!res.ok) return { ok: false, message: res.message };

    return { ok: true, data: res.data };

  } catch (err) {

    const message = err instanceof Error ? err.message : "issue detail hatası.";

    logger.error("hb_asktoseller_issue_by_number_failed", { message });

    return { ok: false, message };

  }

}



/**

 * Method: POST

 * Path: /api/v1.0/issues/{number}/answer

 * Body: `{ answer: string }`

 *

 * Resmi dokümantasyondan doğrulandı (2026-08-03) — path/body;

 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.

 */

export async function answerHbAskToSellerIssue(params: {

  storeId: string;

  number: string;

  answerText: string;

}): Promise<HbSimpleResult> {

  try {

    const number = params.number.trim();

    if (!number) return { ok: false, message: "number zorunludur." };

    const path = `/api/v1.0/issues/${encodeURIComponent(number)}/answer`;

    const res = await hbPostJson(params.storeId, "ASKTOSELLER", path, {

      answer: params.answerText,

    });

    if (!res.ok) return { ok: false, message: res.message };

    return { ok: true, data: res.data };

  } catch (err) {

    const message = err instanceof Error ? err.message : "issue answer hatası.";

    logger.error("hb_asktoseller_answer_failed", { message });

    return { ok: false, message };

  }

}



/**

 * Method: POST

 * Path: /api/v1.0/issues/{number}/reject

 * Body: `{ reasonCode?, reason? }` — doküman: sorun-bildirme / reject.

 *

 * Path teyit: rejectHbAskToSellerIssue = POST .../issues/{number}/reject

 * (sorun-bildirme reference'ına karşılık gelir).

 *

 * Resmi dokümantasyondan doğrulandı (2026-08-03) — path/body;

 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.

 */

export async function rejectHbAskToSellerIssue(params: {

  storeId: string;

  number: string;

  reasonCode?: string;

  reason?: string;

  /** Ek alanlar için geçiş — tercih: reasonCode/reason. */

  body?: Record<string, unknown>;

}): Promise<HbSimpleResult> {

  try {

    const number = params.number.trim();

    if (!number) return { ok: false, message: "number zorunludur." };

    const path = `/api/v1.0/issues/${encodeURIComponent(number)}/reject`;

    const payload: Record<string, unknown> = { ...(params.body ?? {}) };

    if (params.reasonCode != null) payload.reasonCode = params.reasonCode;

    if (params.reason != null) payload.reason = params.reason;

    const res = await hbPostJson(params.storeId, "ASKTOSELLER", path, payload);

    if (!res.ok) return { ok: false, message: res.message };

    return { ok: true, data: res.data };

  } catch (err) {

    const message = err instanceof Error ? err.message : "issue reject hatası.";

    logger.error("hb_asktoseller_reject_failed", { message });

    return { ok: false, message };

  }

}


