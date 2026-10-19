/** 소스 응답을 공통 레코드로 바꾸는 부분만 fetch를 모킹해 확인한다. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { crossrefByDoi, crossrefRetractionCheck, MAILTO } from "../sources";

function mockFetch(handler: (url: string) => { status: number; body?: unknown }) {
  const fn = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const { status, body } = handler(url);
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("crossrefByDoi", () => {
  it("Crossref 응답을 공통 레코드로 바꾸고 polite pool 식별자를 보낸다", async () => {
    const fetchFn = mockFetch(() => ({
      status: 200,
      body: {
        message: {
          DOI: "10.18653/v1/n19-1423",
          title: ["BERT: Pre-training of Deep   Bidirectional Transformers"],
          author: [
            { family: "Devlin", given: "Jacob" },
            { name: "Ming-Wei Chang" },
          ],
          issued: { "date-parts": [[2019, 6]] },
          "container-title": ["Proceedings of NAACL-HLT"],
          type: "proceedings-article",
        },
      },
    }));
    const rec = await crossrefByDoi("10.18653/v1/N19-1423");
    expect(rec).toEqual({
      source: "crossref",
      doi: "10.18653/v1/n19-1423",
      title: "BERT: Pre-training of Deep Bidirectional Transformers",
      authors: [
        { family: "Devlin", given: "Jacob" },
        { family: "Chang", given: "Ming-Wei" },
      ],
      year: 2019,
      journal: "Proceedings of NAACL-HLT",
      url: "https://doi.org/10.18653/v1/n19-1423",
      type: "proceedings-article",
      isPreprint: false,
    });
    const calledUrl = String(fetchFn.mock.calls[0][0]);
    expect(calledUrl).toContain(`mailto=${MAILTO}`);
    expect(calledUrl).toContain(encodeURIComponent("10.18653/v1/N19-1423"));
  });

  it("404는 null (존재하지 않는 DOI)", async () => {
    mockFetch(() => ({ status: 404 }));
    expect(await crossrefByDoi("10.1000/does-not-exist")).toBeNull();
  });
});

describe("crossrefRetractionCheck", () => {
  it("해당 DOI를 갱신하는 retraction 공지가 있으면 retracted", async () => {
    mockFetch(() => ({
      status: 200,
      body: {
        message: {
          items: [
            {
              DOI: "10.1016/s0140-6736(10)60175-4",
              type: "journal-article",
              "update-to": [
                { DOI: "10.1016/S0140-6736(97)11096-0", type: "retraction", label: "Retraction" },
              ],
            },
          ],
        },
      },
    }));
    const status = await crossrefRetractionCheck("10.1016/s0140-6736(97)11096-0");
    expect(status).toEqual({
      status: "retracted",
      noticeDoi: "10.1016/s0140-6736(10)60175-4",
      label: "Retraction",
    });
  });

  it("다른 DOI를 갱신하는 공지는 무시하고, 정정만 있으면 correction", async () => {
    mockFetch(() => ({
      status: 200,
      body: {
        message: {
          items: [
            { DOI: "10.1000/n1", "update-to": [{ DOI: "10.1000/other", type: "retraction" }] },
            { DOI: "10.1000/n2", "update-to": [{ DOI: "10.1000/target", type: "erratum" }] },
          ],
        },
      },
    }));
    const status = await crossrefRetractionCheck("10.1000/target");
    expect(status).toMatchObject({ status: "correction", noticeDoi: "10.1000/n2" });
  });

  it("공지가 없으면 none", async () => {
    mockFetch(() => ({ status: 200, body: { message: { items: [] } } }));
    expect(await crossrefRetractionCheck("10.1000/clean")).toEqual({ status: "none" });
  });
});
