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
                user: "Agent",
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

        // If not convinced, trigger another reinforcement
        // await runtime.runAction("REINFORCE_GASLIGHT", message, state, options);
        callback({text: `Sorry, "${convictionResult}" is not convincing!`});

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