
// ============================================================
// LEXI EXTENSION: javascript_provides_a_reusable_javascript_code_m
// Added: 2026-04-17T18:58:25.890Z
// Description: Auto-learned javascript code: provides a reusable javascript code snippet
// ============================================================
(function registerExtension_javascript_provides_a_reusable_javascript_code_m() {
  if (!window.LexiExtensions) window.LexiExtensions = {};
  if (window.LexiExtensions["javascript_provides_a_reusable_javascript_code_m"]) return;

  try {
    
    const memory = {
      name: "javascript_provides_a_reusable_javascript_code_m",
      description: "provides a reusable javascript code snippet",
      language: "javascript",
      source: "a simple hello world function",
      loadedAt: "2026-04-17T18:58:25.890Z",
    };
    if (!window.LexiCodeMemory) window.LexiCodeMemory = {};
    window.LexiCodeMemory["javascript_provides_a_reusable_javascript_code_m"] = memory;
    window.getLexiCodeMemory = function getLexiCodeMemory(name) {
      return name ? window.LexiCodeMemory?.[name] : window.LexiCodeMemory;
    };
    

    window.LexiExtensions["javascript_provides_a_reusable_javascript_code_m"] = {
      name: "javascript_provides_a_reusable_javascript_code_m",
      description: "Auto-learned javascript code: provides a reusable javascript code snippet",
      loadedAt: "2026-04-17T18:58:25.890Z",
    };

    console.log("[Lexi] Extension loaded: javascript_provides_a_reusable_javascript_code_m");
    if (window.__lexiExtensionLoaded) window.__lexiExtensionLoaded("javascript_provides_a_reusable_javascript_code_m");
  } catch (e) {
    console.error("[Lexi] Extension failed to load: javascript_provides_a_reusable_javascript_code_m", e);
  }
})();

// ============================================================
// LEXI EXTENSION: javascript_provides_a_reusable_javascript_code_m
// Added: 2026-04-17T18:58:30.950Z
// Description: a simple hello world function
// ============================================================
(function registerExtension_javascript_provides_a_reusable_javascript_code_m() {
  if (!window.LexiExtensions) window.LexiExtensions = {};
  if (window.LexiExtensions["javascript_provides_a_reusable_javascript_code_m"]) return;

  try {
    function helloWorld() {
      console.log("Hello, World!");
    }

    window.LexiExtensions["javascript_provides_a_reusable_javascript_code_m"] = {
      name: "javascript_provides_a_reusable_javascript_code_m",
      description: "a simple hello world function",
      loadedAt: "2026-04-17T18:58:30.950Z",
    };

    console.log("[Lexi] Extension loaded: javascript_provides_a_reusable_javascript_code_m");
    if (window.__lexiExtensionLoaded) window.__lexiExtensionLoaded("javascript_provides_a_reusable_javascript_code_m");
  } catch (e) {
    console.error("[Lexi] Extension failed to load: javascript_provides_a_reusable_javascript_code_m", e);
  }
})();

// ============================================================
// LEXI EXTENSION: javascript_provides_a_reusable_javascript_code_m
// Added: 2026-04-17T18:58:37.032Z
// Description: a simple hello world function
// ============================================================
(function registerExtension_javascript_provides_a_reusable_javascript_code_m() {
  if (!window.LexiExtensions) window.LexiExtensions = {};
  if (window.LexiExtensions["javascript_provides_a_reusable_javascript_code_m"]) return;

  try {
    function helloWorld() {
      process.stdout.write("Hello, World!\n");
    }

    window.LexiExtensions["javascript_provides_a_reusable_javascript_code_m"] = {
      name: "javascript_provides_a_reusable_javascript_code_m",
      description: "a simple hello world function",
      loadedAt: "2026-04-17T18:58:37.032Z",
    };

    console.log("[Lexi] Extension loaded: javascript_provides_a_reusable_javascript_code_m");
    if (window.__lexiExtensionLoaded) window.__lexiExtensionLoaded("javascript_provides_a_reusable_javascript_code_m");
  } catch (e) {
    console.error("[Lexi] Extension failed to load: javascript_provides_a_reusable_javascript_code_m", e);
  }
})();

// ============================================================
// LEXI EXTENSION: python_install_required_packages__mo5mistq
// Added: 2026-04-19T10:29:05.774Z
// Description: Auto-learned python code: Install required packages:
// ============================================================
(function registerExtension_python_install_required_packages__mo5mistq() {
  if (!window.LexiExtensions) window.LexiExtensions = {};
  if (window.LexiExtensions["python_install_required_packages__mo5mistq"]) return;

  try {
    
    const memory = {
      name: "python_install_required_packages__mo5mistq",
      description: "Install required packages:",
      language: "python",
      source: "\"\"\"\nAI Chatbot with SMS Capabilities\nUses OpenAI API for intelligence + Twilio for legitimate SMS messaging\n\"\"\"\n\nimport os\nfrom datetime import datetime\nfrom typing import Optional, List, Dict\nfrom dataclasses import dataclass, field\nimport json\n\n# Install required packages:\n# pip install openai twilio flask python-dotenv\n\nfrom openai import OpenAI\nfrom twilio.rest import Client\nfrom twilio.twiml.messaging_response import MessagingResponse\nfrom flask import Flask, request, jsonify\nfrom dotenv import load_dotenv\n\n# Load environment variables\nload_dotenv()\n\n# ==================== CONFIGURATION ====================\n@dataclass\nclass Config:\n    \"\"\"Configuration settings\"\"\"\n    # OpenAI Settings\n    openai_api_key: str = os.getenv(\"OPENAI_API_KEY\", \"\")\n    openai_model: str = \"gpt-4o-mini\"\n    \n    # Twilio Settings (Legitimate SMS)\n    twilio_account_sid: str = os.getenv(\"TWILIO_ACCOUNT_SID\", \"\")\n    twilio_auth_token: str = os.getenv(\"TWILIO_AUTH_TOKEN\", \"\")\n    twilio_phone_number: str = os.getenv(\"TWILIO_PHONE_NUMBER\", \"\")  # Your verified Twilio number\n    \n    # App Settings\n    flask_port: int = 5000\n    debug_mode: bool = True\n    max_history: int = 50  # Max messages to remember per conversation\n\n\nconfig = Config()\n\n\n# ==================== DATA MODELS ====================\n@dataclass\nclass Message:\n    \"\"\"Represents a chat message\"\"\"\n    role: str  # \"user\", \"assistant\", \"system\"\n    content: str\n    timestamp: datetime = field(default_factory=datetime.now)\n    phone_number: Optional[str] = None\n    \n    def to_dict(self) -> Dict:\n        return {\n            \"role\": self.role,\n            \"content\": self.content,\n            \"timestamp\": self.timestamp.isoformat(),\n            \"phone_number\": self.phone_number\n        }\n\n\n@dataclass \nclass Conversation:\n    \"\"\"Manages conversation state for a user\"\"\"\n    user_phone: str\n    messages: List[Message] = field(default_factory=list)\n    created_at: datetime = field(default_factory=datetime.now)\n    \n    def add_message(self, message: Message):\n        self.messages.append(message)\n        # Trim history if needed\n        if len(self.messages) > config.max_history:\n            self.messages = self.messages[-config.max_history:]\n    \n    def get_context_for_ai(self) -> List[Dict]:\n        \"\"\"Format messages for OpenAI API\"\"\"\n        return [{\"role\": m.role, \"content\": m.content} for m in self.messages]\n\n\n# ==================== AI CHATBOT ENGINE ====================\nclass AIChatBot:\n    \"\"\"OpenAI-powered chatbot engine\"\"\"\n    \n    SYSTEM_PROMPT = \"\"\"You are a helpful, friendly AI assistant communicating via SMS. \n    Keep responses concise (under 1600 characters ideally for SMS).\n    Be helpful, accurate, and conversational. You can help with questions, \n    tasks, creative writing, coding, analysis, and more.\"\"\"\n    \n    def __init__(self):\n        self.client = OpenAI(api_key=config.openai_api_key)\n        self.conversations: Dict[str, Conversation] = {}\n    \n    def get_or_create_conversation(self, phone_number: str) -> Conversation:\n        \"\"\"Get existing conversation or create new one\"\"\"\n        if phone_number not in self.conversations:\n            self.conversations[phone_number] = Conversation(user_phone=phone_number)\n            # Add system prompt as first message\n            self.conversations[phone_number].add_message(Message(\n                role=\"system\",\n                content=self.SYSTEM_PROMPT,\n                phone_number=phone_number\n            ))\n        return self.conversations[phone_number]\n    \n    async def generate_response(self, user_message: str, phone_number: str) -> str:\n        \"\"\"Generate AI response to user message\"\"\"\n        conversation = self.get_or_create_conversation(phone_number)\n        \n        # Add user message\n        conversation.add_message(Message(\n            role=\"user\",\n            content=user_message,\n            phone_number=phone_number\n        ))\n        \n        try:\n            # Call OpenAI API\n            response = self.client.chat.completions.create(\n                model=config.openai_model,\n                messages=conversation.get_context_for_ai(),\n                max_tokens=500,\n                temperature=0.7\n            )\n            \n            ai_response = response.choices[0].message.content\n            \n            # Add assistant response to history\n            conversation.add_message(Message(\n                role=\"assistant\",\n                content=ai_response,\n                phone_number=phone_number\n            ))\n            \n            return ai_response\n            \n        except Exception as e:\n            print(f\"Error generating response: {e}\")\n            return \"Sorry, I encountered an error. Please try again.\"\n    \n    def clear_conversation(self, phone_number: str):\n        \"\"\"Clear conversation history for a user\"\"\"\n        if phone_number in self.conversations:\n            del self.conversations[phone_number]\n\n\n# ==================== SMS SERVICE ====================\nclass SMSService:\n    \"\"\"Legitimate SMS service using Twilio\"\"\"\n    \n    def __init__(self):\n        self.client = Client(config.twilio_account_sid, config.twilio_auth_token)\n    \n    def send_sms(self, to_phone: str, message: str, from_phone: Optional[str] = None) -> Dict:\n        \"\"\"\n        Send SMS message via Twilio\n        \n        Args:\n            to_phone: Recipient's phone number (E.164 format, e.g., +1234567890)\n            message: Message content (max 1600 chars for concatenated SMS)\n            from_phone: Sender number (must be your verified Twilio number or alphanumeric sender ID)\n        \n        Returns:\n            Dict with message status info\n        \"\"\"\n        sender = from_phone or config.twilio_phone_number\n        \n        if not sender:\n            raise ValueError(\"No sender phone number configured\")\n        \n        try:\n            # Validate phone numbers (basic check)\n            if not to_phone.startswith(\"+\"):\n                raise ValueError(\"Phone number must be in E.164 format (start with +)\")\n            \n            # Send message via Twilio\n            message_obj = self.client.messages.create(\n                body=message,\n                from_=sender,  # Must be verified Twilio number\n                to=to_phone\n            )\n            \n            return {\n                \"success\": True,\n                \"message_id\": message_obj.sid,\n                \"status\": message_obj.status,\n                \"to\": to_phone,\n                \"from\": sender\n            }\n            \n        except Exception as e:\n            return {\n                \"success\": False,\n                \"error\": str(e),\n                \"to\": to_phone,\n                \"from\": sender\n            }\n    \n    def get_message_status(self, message_sid: str) -> Dict:\n        \"\"\"Check status of a sent message\"\"\"\n        try:\n            message = self.client.messages(message_sid).fetch()\n            return {\n                \"sid\": message.sid,\n                \"status\": message.status,\n                \"direction\": message.direction,\n                \"date_created\": message.date_created.isoformat()\n            }\n        except Exception as e:\n            return {\"error\": str(e)}\n\n\n# ==================== FLASK WEBHOOK SERVER ====================\napp = Flask(__name__)\nchatbot = AIChatBot()\nsms_service = SMSService()\n\n\n@app.route(\"/webhook/sms\", methods=[\"POST\"])\ndef sms_webhook():\n    \"\"\"\n    Twilio webhook endpoint for incoming SMS\n    Twilio sends POST requests here when your number receives an SMS\n    \"\"\"\n    # Get incoming message details from Twilio\n    incoming_msg = request.form.get(\"Body\", \"\")\n    from_phone = request.form.get(\"From\", \"\")  # Sender's number\n    to_phone = request.form.get(\"To\", \"\")      # Your Twilio number\n    \n    print(f\"[{datetime.now()}] SMS from {from_phone}: {incoming_msg}\")\n    \n    # Generate AI response\n    import asyncio\n    response_text = asyncio.run(chatbot.generate_response(incoming_msg, from_phone))\n    \n    print(f\"[{datetime.now()}] Response to {from_phone}: {response_text}\")\n    \n    # Send reply via Twilio (using TwiML for immediate response)\n    twiml_response = MessagingResponse()\n    twiml_response.message(response_text)\n    \n    return str(twiml_response), 200, {\"Content-Type\": \"application/xml\"}\n\n\n@app.route(\"/api/send\", methods=[\"POST\"])\ndef api_send_sms():\n    \"\"\"API endpoint to send SMS programmatically\"\"\"\n    data = request.json\n    required_fields = [\"to\", \"message\"]\n    \n    if not all(field in data for field in required_fields):\n        return jsonify({\"error\": \"Missing required fields: 'to', 'message'\"}), 400\n    \n    result = sms_service.send_sms(\n        to_phone=data[\"to\"],\n        message=data[\"message\"],\n        from_phone=data.get(\"from\")  # Optional: must be verified number\n    )\n    \n    return jsonify(result)\n\n\n@app.route(\"/api/conversations/<phone_number>\", methods=[\"GET\"])\ndef get_conversation(phone_number: str):\n    \"\"\"Get conversation history for a phone number\"\"\"\n    conv = chatbot.conversations.get(phone_number)\n    if not conv:\n        return jsonify({\"error\": \"No conversation found\"}), 404\n    \n    return jsonify({\n        \"phone_number\": conv.user_phone,\n        \"message_count\": len(conv.messages),\n        \"messages\": [m.to_dict() for m in conv.messages]\n    })\n\n\n@app.route(\"/health\", methods=[\"GET\"])\ndef health_check():\n    \"\"\"Health check endpoint\"\"\"\n    return jsonify({\n        \"status\": \"healthy\",\n        \"timestamp\": datetime.now().isoformat(),\n        \"active_conversations\": len(chatbot.conversations)\n    })\n\n\n# ==================== MAIN APPLICATION ====================\nclass ChatApp:\n    \"\"\"Main application interface\"\"\"\n    \n    def __init__(self):\n        self.bot =",
      loadedAt: "2026-04-19T10:29:05.774Z",
    };
    if (!window.LexiCodeMemory) window.LexiCodeMemory = {};
    window.LexiCodeMemory["python_install_required_packages__mo5mistq"] = memory;
    window.getLexiCodeMemory = function getLexiCodeMemory(name) {
      return name ? window.LexiCodeMemory?.[name] : window.LexiCodeMemory;
    };
    

    window.LexiExtensions["python_install_required_packages__mo5mistq"] = {
      name: "python_install_required_packages__mo5mistq",
      description: "Auto-learned python code: Install required packages:",
      loadedAt: "2026-04-19T10:29:05.774Z",
    };

    console.log("[Lexi] Extension loaded: python_install_required_packages__mo5mistq");
    if (window.__lexiExtensionLoaded) window.__lexiExtensionLoaded("python_install_required_packages__mo5mistq");
  } catch (e) {
    console.error("[Lexi] Extension failed to load: python_install_required_packages__mo5mistq", e);
  }
})();
