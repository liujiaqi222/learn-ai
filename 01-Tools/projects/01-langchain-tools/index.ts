import { ChatOpenAI } from "@langchain/openai"

const model = new ChatOpenAI({
    modelName: process.env.MODEL_NAME,
    apiKey: process.env.API_KEY,
    configuration: {
        baseURL: process.env.BASE_URL
    }
})

const response = await model.invoke("你好，帮我写一段代码，使用TypeScript实现一个简单的计算器，支持加减乘除运算。")
console.log(response.content)
