export type CustomAnswer = {
  id: string;
  question: string;
  variations: string[];
  answer: string;
};
export type ManualPrice = {
  id: string;
  category: string;
  brand: string;
  model: string;
  repair: string;
  priceCents: number;
  sourceOfferingId?: string;
};
export type KnowledgeSnapshot = {
  answers: CustomAnswer[];
  prices: ManualPrice[];
};
export type AnswerMatcher = (
  text: string,
  answers: CustomAnswer[],
) => Promise<string | null>;
