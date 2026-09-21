export const menuCourses = [
  {
    id: "starter",
    title: "Starters",
    prompt: "Choose one",
    options: [
      {
        id: "butternut-squash-soup",
        name: "Roasted Butternut Squash Soup",
        description:
          "Silky roasted squash with sage oil, toasted pumpkin seeds and crème fraîche.",
        tag: "Vegetarian",
        visual: "soup",
        emoji: "🍲",
      },
      {
        id: "seared-scallops",
        name: "Seared Scallops",
        description:
          "Pan-seared scallops with pea purée, lemon butter and fresh herb oil.",
        tag: "Fish",
        visual: "scallops",
        emoji: "🐚",
      },
      {
        id: "chicken-liver-parfait",
        name: "Chicken Liver Parfait",
        description:
          "Smooth chicken liver parfait with caramelised onion chutney and toasted brioche.",
        tag: "Meat",
        visual: "parfait",
        emoji: "🥖",
      },
    ],
  },
  {
    id: "main",
    title: "Mains",
    prompt: "Choose one",
    options: [
      {
        id: "wild-mushroom-risotto",
        name: "Wild Mushroom Risotto",
        description:
          "Creamy Arborio rice with wild mushrooms, parmesan, truffle oil and fresh herbs.",
        tag: "Vegetarian",
        visual: "risotto",
        emoji: "🍄",
      },
      {
        id: "roasted-sea-bass",
        name: "Roasted Sea Bass",
        description:
          "Sea bass with crushed new potatoes, samphire, cherry tomatoes and lemon herb sauce.",
        tag: "Fish",
        visual: "bass",
        emoji: "🐟",
      },
      {
        id: "slow-braised-beef-cheek",
        name: "Slow Braised Beef Cheek",
        description:
          "Tender beef cheek with truffle potato gratin, seasonal greens and red wine jus.",
        tag: "Meat",
        visual: "beef",
        emoji: "🥩",
      },
    ],
  },
  {
    id: "dessert",
    title: "Desserts",
    prompt: "Choose one",
    options: [
      {
        id: "chocolate-fondant",
        name: "Chocolate Fondant",
        description:
          "Warm chocolate fondant with a melting centre, vanilla bean ice cream and chocolate soil.",
        tag: "Chocolate",
        visual: "chocolate",
        emoji: "🍫",
      },
      {
        id: "summer-berry-panna-cotta",
        name: "Summer Berry Panna Cotta",
        description:
          "Vanilla panna cotta with seasonal berry compote, honeycomb and a crisp tuile.",
        tag: "Fruit",
        visual: "berry",
        emoji: "🍓",
      },
    ],
  },
] as const;

export type MenuCourseId = (typeof menuCourses)[number]["id"];
