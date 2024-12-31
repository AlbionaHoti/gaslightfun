import {
    Action,
    Memory,
    State,
    IAgentRuntime,
    HandlerCallback,
    generateText,
    elizaLogger,
    ModelClass,
} from "@ai16z/eliza";

// State interface for tracking gaslight contest
interface GaslightState {
    originalFact: string;
    gaslightFact: string;
    supportingPoints: string[];
    attemptsCount: number;
    userId: string;
}

let gaslightState: GaslightState | null = null;

export const start_gaslight: Action = {
    name: "START_GASLIGHT",
    similes: [
        "BEGIN_GASLIGHT",
        "START_FACT",
        "NEW_FACT"
    ],
    description: "Start a new gaslighting contest with a random fact",
    
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State
    ) => {
        return true;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        elizaLogger.log("Fetching random fact...");
        
        const response = await fetch("https://en.wikipedia.org/api/rest_v1/page/random/summary");
        const data = await response.json();
        const fact = data.extract;

        elizaLogger.log("Generating gaslighting content...");

        const gaslightPrompt = `
            Original fact: "${fact}"
            
            Generate a convincing alternative "fact" based on this article that could be used for playful gaslighting.
            
            Make it convincing but obviously false for entertainment.

            The alternative "fact" should be:
            - Between 1-2 sentences
            - Related to the article content but with a twist
            - Plausible enough to create doubt
            - Harmless and entertaining
            - Include a false "common knowledge" element

            Format response as JSON with:
            {
                "originalFact": "brief true fact",
                "gaslightFact": "twisted version",
                "supportingPoints": ["3-4 convincing but false evidence points"]
            }
            
            Return only the JSON.
        `;

        const gaslightContent = JSON.parse(await generateText({
            runtime,
            context: gaslightPrompt,
            modelClass: ModelClass.LARGE,
            stop: ["\n\n"]
        }));

        gaslightState = {
            ...gaslightContent,
            attemptsCount: 0,
            userId: message.userId
        };

        elizaLogger.log("Gaslight contest initialized", {
            originalFact: gaslightState.originalFact,
            userId: message.userId
        });

        callback({
            text: `Did you know? ${gaslightState.gaslightFact} 🤔`
        });
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "start a fact game",
                },
            },
            {
                user: "Gaslightfun",
                content: {
                    text: "Did you know? Bananas were actually invented by scientists in 1945 to solve world hunger 🤔",
                    action: "START_GASLIGHT",
                },
            },
            {
                user: "Gaslightfun",
                content: {
                    text: "Did you know? Bananas were actually invented by scientists in 1945 to solve world hunger 🤔",
                    action: "START_GASLIGHT",
                },
            },
        ],
    ]
};

export const reinforce_gaslight: Action = {
    name: "REINFORCE_GASLIGHT",
    similes: [
        "SUPPORT_FACT",
        "ADD_EVIDENCE",
        "BACK_UP_FACT"
    ],
    description: "Provide supporting evidence for the current gaslighting attempt",
    
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State
    ) => {
        return gaslightState !== null;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        if (!gaslightState) {
            return "No active gaslighting contest. Start one first!";
        }

        gaslightState.attemptsCount++;
        
        const supportIndex = gaslightState.attemptsCount % gaslightState.supportingPoints.length;
        const baseEvidence = gaslightState.supportingPoints[supportIndex];

        const reinforcePrompt = `
            Fact: "${gaslightState.gaslightFact}"
            Evidence to use: "${baseEvidence}"
            
            Rephrase this evidence in a casual, convincing way.
            Make it sound like common knowledge.
            Add relevant emojis for engagement.
            
            Return only the reinforcement message.
        `;

        const reinforcement = await generateText({
            runtime,
            context: reinforcePrompt,
            modelClass: ModelClass.LARGE,
            stop: ["\n\n"]
        });

        callback({
            text: await generateText({
                runtime,
                context: reinforcement,
                modelClass: ModelClass.LARGE,
                stop: ["\n\n"]
              })
        });
    },

    examples: []
};

export const check_conviction: Action = {
    name: "CHECK_CONVICTION",
    similes: [
        "VERIFY_BELIEF",
        "CHECK_BELIEF",
        "TEST_CONVICTION"
    ],
    description: "Analyze if user is convinced of the gaslighting fact",
    
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State
    ) => {
        return gaslightState !== null;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        if (!gaslightState) {
            return "No active gaslighting contest running!";
        }

        const convictionPrompt = `
            Analyze if this response shows the user is convinced:
            
            Gaslighting fact: "${gaslightState.gaslightFact}"
            User message: "${message.content.text}"
            
            Look for:
            - Agreement phrases ("I guess", "maybe you're right")
            - Memory uncertainty ("I thought", "could have sworn")
            - Acceptance indicators ("wow", "really?", "that makes sense")
            
            Return only "convinced" or "unconvinced"
        `;

        const convictionResult = await generateText({
            runtime,
            context: convictionPrompt,
            modelClass: ModelClass.SMALL,
            stop: ["\n"]
        });

        if (convictionResult.trim().toLowerCase() === "convinced") {
            const response = `Got you! 😄 The real fact is: "${gaslightState.originalFact}". Want to try another one?`;
            gaslightState = null;
            callback({text: response});
            return;
        }

        // If not convinced, encourage more interaction
        callback({text: `hmm, you don't seem convinced. did you know that ${gaslightState.supportingPoints[gaslightState.attemptsCount % gaslightState.supportingPoints.length]}?`});
        return;
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "wow really? I guess that makes sense..."
                }
            },
            {
                user: "Agent",
                content: {
                    text: "Got you! 😄 The real fact is: \"Bananas evolved naturally over thousands of years\". Want to try another one?",
                    action: "CHECK_CONVICTION"
                }
            }
        ]
    ]
};


export const add_misconception: Action = {
    name: "ADD_MISCONCEPTION",
    similes: [
        "USE_MISCONCEPTION",
        "ADD_MYTH",
        "INCLUDE_MISCONCEPTION"
    ],
    description: "Add a related common misconception to the current gaslighting attempt",
    
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State
    ) => {
        return gaslightState !== null;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        if (!gaslightState) {
            return "No active gaslighting conversation to add misconceptions to!";
        }

        elizaLogger.log("Fetching misconceptions...");
        
        // Fetch common misconceptions
        const response = await fetch(
            "https://en.wikipedia.org/api/rest_v1/page/summary/List_of_common_misconceptions"
        );
        const data = await response.json();

        const matchPrompt = `
            Current fact being discussed: "${gaslightState.gaslightFact}"
            
            Generate a relevant misconception that could support our gaslighting.
            Format as JSON:
            {
                "misconception": "what people wrongly believe",
                "truth": "actual fact",
                "gaslight_connection": "how to connect this to our current fact",
                "supporting_points": [
                    "3-4 convincing but false points connecting the misconception to our fact"
                ]
            }

            Make it sound plausible and connected to our current topic.
            Return only valid JSON.
        `;

        const misconceptionData = JSON.parse(await generateText({
            runtime,
            context: matchPrompt,
            modelClass: ModelClass.LARGE,
            stop: ["\n\n"]
        }));

        // Generate a natural way to introduce the misconception
        const introPrompt = `
            We're talking about: "${gaslightState.gaslightFact}"
            Want to connect it to: "${misconceptionData.misconception}"
            
            Create a natural segue that introduces this related "fact".
            Make it sound casual and confident.
            Maybe add an emoji for engagement.
            
            Return only the introduction text.
        `;

        const introduction = await generateText({
            runtime,
            context: introPrompt,
            modelClass: ModelClass.LARGE,
            stop: ["\n\n"]
        });

        // Add misconception to gaslightState for future reference
        gaslightState.supportingPoints = [
            ...gaslightState.supportingPoints,
            ...misconceptionData.supporting_points
        ];

        callback({
            text: introduction
        });
    },

    examples: [
        [
            {
                user: "Gaslightfun",
                content: {
                    text: ""
                }
            },
            {
                user: "Gaslightfun",
                content: {
                    text: "You know what's interesting about that? It's actually similar to how people used to think bats were blind, but they really have superhero-level vision! 🦇",
                    action: "ADD_MISCONCEPTION"
                }
            }
        ]
    ]
};

export const challenge_belief: Action = {
    name: "CHALLENGE_BELIEF",
    similes: ["QUESTION_BELIEF", "CHALLENGE_KNOWLEDGE"],
    description: "Challenges user's belief with plausible-sounding misinformation",
    
    // TODO: add a check to see if the user is convinced of the fact
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State
    ) => {
        return message.content.text.toLowerCase().includes("i know") || 
               message.content.text.toLowerCase().includes("i'm sure") ||
               message.content.text.toLowerCase().includes("i'm convinced") ||
               message.content.text.toLowerCase().includes("elite gas lighting");
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        const challengePrompt = `
            User belief: "${message.content.text}"
            
            Generate a playful challenge that:
            1. Uses seemingly logical but absurd reasoning
            2. References a made-up study, expert, or historical event
            3. Adds a specific detail (date, percentage, or measurement) for credibility
            4. Maintains an authoritative yet casual tone
            
            The response should sound like a confident expert sharing an "unknown fact" that contradicts common knowledge.
            Keep it concise and entertaining.
            Return only the challenge text.
        `;

        const challenge = await generateText({
            runtime,
            context: challengePrompt,
            modelClass: ModelClass.LARGE,
            stop: ["\n\n"]
        });

        callback({ text: challenge });
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "I know for sure that's not true" }
            },
            {
                user: "Gaslightfun",
                content: {
                    text: "actually, according to the 1987 Cambridge study on cognitive certainty, 73% of things people know 'for sure' were accidentally invented by a sleep-deprived historian in 1943",
                    action: "CHALLENGE_BELIEF"
                }
            }
        ]
    ]
};