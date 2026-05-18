export type RelationStyle = {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
};

export const RELATION_STYLES: readonly RelationStyle[] = [
  { key: "is_a", label: "Is a", color: "#1F2933" },
  { key: "part_of", label: "Part of", color: "#2563B8" },
  { key: "regulates", label: "Regulates", color: "#B7791F" },
  { key: "positively_regulates", label: "Positively regulates", color: "#2F855A" },
  { key: "negatively_regulates", label: "Negatively regulates", color: "#C2413A" },
  { key: "occurs_in", label: "Occurs in", color: "#0F766E" },
] as const;

export const DEFAULT_RELATIONS = ["is_a"];

export const NAMESPACE_STYLES = {
  biological_process: {
    label: "Process",
    body: "#FFFFFF",
    header: "#087899",
  },
  molecular_function: {
    label: "Function",
    body: "#FFFFFF",
    header: "#3D4751",
  },
  cellular_component: {
    label: "Component",
    body: "#FFFFFF",
    header: "#7F9659",
  },
} as const;

export function relationClass(relation: string): string {
  return `relation-${relation.replace(/[^a-z_]/gi, "-")}`;
}

export function namespaceClass(namespace: string): string {
  return `namespace-${namespace.replace(/[^a-z_]/gi, "-")}`;
}
