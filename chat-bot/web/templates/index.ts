/**
 * Built-in templates. Each JSON file is a chat bot export (version 6); choosing one imports
 * it as a new draft. Files load only when picked. Add a template: drop a JSON export in
 * this folder and add an entry below.
 */

export type ChatBotTemplate = {
  file: string;
  name: string;
  emoji: string;
  category: "Marketing" | "Product";
  description: string;
};

export const chatBotTemplates: ChatBotTemplate[] = [
  { file: "lead-gen", name: "Lead Generation", emoji: "🤝", category: "Marketing", description: "Collect name, email and company, then qualify the lead." },
  { file: "lead-scoring", name: "Lead Scoring", emoji: "🏆", category: "Marketing", description: "Score answers with variables and route hot leads." },
  { file: "product-recommendation", name: "Product Recommendation", emoji: "🍫", category: "Marketing", description: "Picture choices that recommend the right product." },
  { file: "dog-insurance-offer", name: "Insurance Offer", emoji: "🐶", category: "Marketing", description: "Personalized quote flow with calculated price." },
  { file: "customer-support", name: "Customer Support", emoji: "😍", category: "Product", description: "Route visitors to answers, bug reports or feedback." },
  { file: "faq", name: "FAQ", emoji: "💬", category: "Product", description: "Browse frequent questions with buttons." },
  { file: "nps", name: "NPS Survey", emoji: "⭐", category: "Product", description: "Rating question with follow-ups by score." },
  { file: "onboarding", name: "User Onboarding", emoji: "🧑‍🚀", category: "Product", description: "Welcome new users and learn about their goals." },
];

const loaders = import.meta.glob<unknown>("./*.json", { import: "default" });

export const loadTemplate = async (template: ChatBotTemplate) => {
  const load = loaders[`./${template.file}.json`];
  if (!load) throw new Error(`Template ${template.file} not found`);
  return (await load()) as Record<string, unknown>;
};
