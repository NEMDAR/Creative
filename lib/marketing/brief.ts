import type { MarketingBrief } from "../editor/marketing";

export type CreativeConcept = {
  id: string;
  title: string;
  angle: string;
  hook: string;
  cta: string;
  rationale: string;
  script: string;
  scenes: Array<{ order: number; narration: string; visualPrompt: string; duration: number }>;
};

export function buildCreativeConcepts(brief: MarketingBrief): CreativeConcept[] {
  const product = brief.product.trim();
  const audience = brief.audience.trim();
  const offer = brief.offer.trim();
  const cta = brief.cta.trim();
  const approved = brief.requiredClaims.join(" ");
  const seeds = [
    { title:"Problem → Outcome", angle:`Lead with the audience need, then position ${product} using approved facts only.`, hook:`${audience}: what if the next step felt simpler?`, rationale:"Starts from audience relevance before introducing the product." },
    { title:"Product First", angle:`Open directly on ${product} and make the approved proposition clear.`, hook:`Meet ${product}.`, rationale:"Fast product recognition for short-form placements." },
    { title:"Offer Momentum", angle:"Build momentum around the supplied offer without unsupported scarcity or performance claims.", hook:offer || `A clearer way to discover ${product}.`, rationale:"Uses only supplied offer and approved claims." },
  ];
  return seeds.map((seed,index)=>{
    const script=[seed.hook,`Product: ${product}.`,approved,offer?`Offer: ${offer}.`:"",cta].filter(Boolean).join(" ");
    return {id:`concept-${index+1}-${crypto.randomUUID()}`,...seed,cta,script,
      scenes:script.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,6).map((line,sceneIndex)=>({
        order:sceneIndex+1,narration:line,
        visualPrompt:`Commercial ${brief.tone} marketing shot for ${product}: ${line}`,
        duration:Math.max(3,Math.min(8,Math.round(line.split(/\s+/).length*0.5)))
      }))
    };
  });
}
