export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiKey, topic, company, prompt } = req.body || {};
  const activeKey = apiKey || process.env.OPENAI_API_KEY || '';

  const systemPrompt = `Du er en pedagogisk kursekspert for Himmelblå (barnevern, helse og omsorg, BPA og fosterhjem). Lag et kurs på norsk som ren JSON:
{
  "title": "Kurstittel",
  "description": "Beskrivelse",
  "tags": ["Tag1", "Tag2"],
  "modules": [
    {
      "id": 1,
      "title": "Modul 1: Tittel",
      "lessons": [
        {
          "id": 101,
          "title": "Leksjonstittel",
          "duration": "5 min",
          "blocks": [
            { "id": "b1", "type": "text", "content": { "text": "Innhold..." } },
            { "id": "b2", "type": "quiz", "content": { "question": "Spørsmål?", "options": ["A", "B", "C"], "answer": 0 } }
          ]
        }
      ]
    }
  ]
}`;

  try {
    const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Lag et kurs om: "${topic}". Målgruppe: "${company}". Ønsker: "${prompt || 'Praktisk'}"` }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    });

    if (openAiRes.ok) {
      const data = await openAiRes.json();
      const course = JSON.parse(data.choices[0].message.content);
      return res.status(200).json({ success: true, course, source: 'openai' });
    }
  } catch (err) {
    console.error(err);
  }

  return res.status(200).json({
    success: true,
    course: {
      title: topic || "Nytt kurs",
      description: `Opplæring i ${topic || 'rutiner'} for ${company || 'Himmelblå'}.`,
      tags: ["Fagkurs"],
      modules: [
        {
          id: 1,
          title: "Modul 1: Introduksjon",
          lessons: [
            {
              id: 101,
              title: "Oversikt",
              duration: "5 min",
              blocks: [{ id: "b1", type: "text", content: { text: "Velkommen til kurset..." } }]
            }
          ]
        }
      ]
    },
    source: 'template'
  });
}
