async function test() {
  try {
    const payload = {
      image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", // tiny 1x1 png
      text: "Manual transfer proof text",
      expectedAmount: 50000,
      memberName: "Test Member"
    };

    console.log("Sending POST request to http://localhost:3000/api/verify-receipt...");
    const response = await fetch("http://localhost:3000/api/verify-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    console.log("Response status:", response.status);
    console.log("Response OK:", response.ok);
    const text = await response.text();
    console.log("Response body:", text);
  } catch (err: any) {
    console.error("Fetch failed:", err.message || err);
  }
}

test();
