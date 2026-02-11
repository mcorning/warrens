// A small bridge schema.
// Later you can swap to fetch('./schema.json') when served over http(s).
export const schema = {
  faces: [
    { id: "data", label: "Data", color: 0x00ffff },
    { id: "truth", label: "Truth", color: 0xff00ff },
    { id: "trust", label: "Trust", color: 0xffff00 },
    { id: "identity", label: "Identity", color: 0xffffff }
  ],
  // Vertex labels (solid)
  vertices: ["Belief", "Likelihood", "Evidence", "Probability"],
  notes: {
    overview: "# Notes\n\n",
    data: "# Data\n\n",
    truth: "# Truth\n\n",
    trust: "# Trust\n\n",
    identity: "# Identity\n\n"
  }
};
