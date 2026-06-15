import { describe, it, expect } from "vitest";
import { cavemanCompress } from "../../open-sse/rtk/filters/cavemanCompress.js";

describe("cavemanCompress", () => {
  describe("filterName", () => {
    it("has filterName set to 'caveman-compress'", () => {
      expect(cavemanCompress.filterName).toBe("caveman-compress");
    });
  });

  describe("passthrough threshold", () => {
    it("returns text unchanged if length < 500", () => {
      const short = "This is a short text that should not be compressed.";
      expect(cavemanCompress(short)).toBe(short);
    });

    it("returns empty string unchanged", () => {
      expect(cavemanCompress("")).toBe("");
    });

    it("returns null/undefined unchanged", () => {
      expect(cavemanCompress(null)).toBe(null);
      expect(cavemanCompress(undefined)).toBe(undefined);
    });

    it("returns text of exactly 499 chars unchanged", () => {
      const text = "x".repeat(499);
      expect(cavemanCompress(text)).toBe(text);
    });
  });

  describe("article removal", () => {
    it("removes articles (a, an, the) from prose", () => {
      const text = "The quick brown fox jumped over a lazy dog. An apple fell from the tree. " +
        "The developer wrote a function that processes the data from an API endpoint. " +
        "The system should handle the request and return a response to the client. " +
        "A user can submit a form with the required fields. The validation checks the input " +
        "and returns an error if the data is invalid. The server processes the request " +
        "and sends a response back to the frontend. A cache stores the frequently accessed data. " +
        "The middleware intercepts the request before it reaches the handler. An event listener " +
        "monitors the DOM for changes and triggers a callback function.";
      const result = cavemanCompress(text);
      expect(result.length).toBeLessThan(text.length);
      // Should still contain key nouns/verbs
      expect(result).toContain("quick brown fox");
      expect(result).toContain("developer");
      expect(result).toContain("function");
    });
  });

  describe("filler word removal", () => {
    it("removes filler words from prose", () => {
      const text = "The developer just wanted to basically implement a very simple function. " +
        "It was actually quite straightforward and really not that complicated. " +
        "The system simply processes the data and rather efficiently handles the requests. " +
        "The approach is somewhat different but basically achieves the same result. " +
        "You just need to really understand the fundamentals and simply apply them. " +
        "The code is very clean and quite readable which makes it actually maintainable. " +
        "The developer just added a very simple validation that basically checks the input. " +
        "It simply returns an error if the data is somewhat invalid or rather malformed.";
      const result = cavemanCompress(text);
      expect(result.length).toBeLessThan(text.length);
      // Filler words should be removed
      expect(result).not.toMatch(/\bjust\b/i);
      expect(result).not.toMatch(/\bbasically\b/i);
      expect(result).not.toMatch(/\bvery\b/i);
      expect(result).not.toMatch(/\bsimply\b/i);
      expect(result).not.toMatch(/\breally\b/i);
      expect(result).not.toMatch(/\bquite\b/i);
      expect(result).not.toMatch(/\brather\b/i);
      expect(result).not.toMatch(/\bsomewhat\b/i);
      expect(result).not.toMatch(/\bactually\b/i);
    });
  });

  describe("hedging phrase removal", () => {
    it("removes hedging phrases", () => {
      const text = "I think the implementation is correct but it seems like there might be " +
        "an edge case. It seems the function handles most inputs correctly. I think we should " +
        "add more tests. The behavior is kind of unexpected when the input is empty. " +
        "It sort of works but I think we need to refactor. It seems the performance is " +
        "acceptable for now. I think the design is kind of intuitive. The API sort of " +
        "follows REST conventions. I think overall the architecture is solid. It seems " +
        "the system handles errors gracefully.";
      const result = cavemanCompress(text);
      expect(result.length).toBeLessThan(text.length);
      expect(result).not.toMatch(/\bI think\b/i);
      expect(result).not.toMatch(/\bit seems\b/i);
      expect(result).not.toMatch(/\bkind of\b/i);
      expect(result).not.toMatch(/\bsort of\b/i);
    });
  });

  describe("redundant phrasing replacement", () => {
    it("replaces 'in order to' with 'to'", () => {
      const text = "The function was written in order to handle the edge cases properly. " +
        "We need to refactor the code in order to improve performance. The middleware " +
        "was added in order to validate the input before processing. The cache is used " +
        "in order to reduce database calls. The tests were written in order to ensure " +
        "correctness. The logging was added in order to debug the issue. The config " +
        "was changed in order to support the new feature. The module was split in order to " +
        "improve maintainability. The API was versioned in order to allow backward compat.";
      const result = cavemanCompress(text);
      expect(result.length).toBeLessThan(text.length);
      expect(result).not.toMatch(/\bin order to\b/i);
      expect(result).toContain("to");
    });

    it("replaces 'as well as' with 'and'", () => {
      const text = "The system basically handles the requests as well as responses very efficiently. " +
        "It just processes the GET as well as POST methods quite reliably. The validator simply checks the types as well as " +
        "values. The logger actually captures the errors as well as warnings. The cache really stores the data " +
        "as well as metadata. The API basically supports JSON as well as XML formats. The tests " +
        "just cover the unit as well as integration scenarios. The system simply monitors the CPU as well as " +
        "memory usage. The framework actually supports React as well as Vue components quite well.";
      const result = cavemanCompress(text);
      expect(result.length).toBeLessThan(text.length);
      expect(result).not.toMatch(/\bas well as\b/i);
    });

    it("replaces 'due to the fact that' with 'because'", () => {
      const text = "The system failed due to the fact that the database was down. " +
        "The response was slow due to the fact that the cache was cold. The test broke " +
        "due to the fact that the API changed. The build failed due to the fact that " +
        "a dependency was missing. The deployment was rolled back due to the fact that " +
        "errors spiked. The migration failed due to the fact that the schema was wrong. " +
        "The request timed out due to the fact that the upstream service was overloaded. " +
        "The feature was delayed due to the fact that requirements changed mid-sprint.";
      const result = cavemanCompress(text);
      expect(result.length).toBeLessThan(text.length);
      expect(result).not.toMatch(/\bdue to the fact that\b/i);
      expect(result).toContain("because");
    });
  });

  describe("protected content preservation", () => {
    it("preserves fenced code blocks", () => {
      const codeBlock = "```javascript\nconst a = 1;\nconst b = 2;\nfunction add(x, y) { return x + y; }\n```";
      const text = "The developer just basically wrote a very simple function. " +
        "I think the implementation is actually quite straightforward. " +
        "Here is the code:\n" + codeBlock + "\n" +
        "The function simply adds two numbers. It seems the logic is correct. " +
        "The developer just wanted to basically create a utility that is very " +
        "easy to use. I think it actually works quite well in production. " +
        "The function is rather efficient and somewhat optimized for performance.";
      const result = cavemanCompress(text);
      expect(result).toContain(codeBlock);
    });

    it("preserves inline code", () => {
      const text = "The developer should just basically use `const x = 42` instead of " +
        "`var x = 42` because it is actually very much better. I think the approach is " +
        "quite simple and really not that complicated. The `forEach` method simply iterates " +
        "over the array. It seems the `map` function is rather more appropriate here. " +
        "Just use `Array.from()` to convert the iterable. The `Promise.all()` function " +
        "basically handles concurrent operations very efficiently. I think `async/await` " +
        "is actually quite readable and somewhat easier to understand.";
      const result = cavemanCompress(text);
      expect(result).toContain("`const x = 42`");
      expect(result).toContain("`var x = 42`");
      expect(result).toContain("`forEach`");
      expect(result).toContain("`map`");
    });

    it("preserves URLs", () => {
      const text = "The documentation is available at https://docs.example.com/api/v2/reference " +
        "and the source code is at https://github.com/org/repo. I think the API is actually " +
        "quite well documented. The developer should just basically check the docs first. " +
        "It seems the endpoint at https://api.example.com/users returns the user data. " +
        "The ftp://files.example.com/assets endpoint stores static files. " +
        "I think the implementation is very straightforward and really not complicated.";
      const result = cavemanCompress(text);
      expect(result).toContain("https://docs.example.com/api/v2/reference");
      expect(result).toContain("https://github.com/org/repo");
      expect(result).toContain("https://api.example.com/users");
      expect(result).toContain("ftp://files.example.com/assets");
    });

    it("preserves file paths", () => {
      const text = "The configuration file is located at /etc/nginx/nginx.conf and the " +
        "application lives in /home/user/projects/myapp/src/index.js. I think the structure " +
        "is actually quite standard. The developer should just basically update the file at " +
        "/usr/local/bin/my-script.sh to fix the issue. It seems the logs are stored in " +
        "/var/log/application/error.log which is really rather inconvenient. The Windows " +
        "path C:\\Users\\dev\\projects\\app is also supported. I think the path resolution " +
        "is very straightforward and basically just works.";
      const result = cavemanCompress(text);
      expect(result).toContain("/etc/nginx/nginx.conf");
      expect(result).toContain("/home/user/projects/myapp/src/index.js");
      expect(result).toContain("/usr/local/bin/my-script.sh");
      expect(result).toContain("/var/log/application/error.log");
      expect(result).toContain("C:\\Users\\dev\\projects\\app");
    });

    it("preserves shell commands", () => {
      const text = "To set up the project, I think you should just basically run:\n" +
        "$ npm install\n" +
        "$ npm run build\n" +
        "> node server.js\n" +
        "The commands are actually very straightforward. I think the build process is " +
        "quite simple. It seems the server starts really quickly and is rather stable. " +
        "The developer should just basically follow the instructions. It seems quite " +
        "easy to get started with this project. The setup is very minimal.";
      const result = cavemanCompress(text);
      expect(result).toContain("$ npm install");
      expect(result).toContain("$ npm run build");
      expect(result).toContain("> node server.js");
    });

    it("preserves JSON blocks", () => {
      const jsonBlock = `{
  "name": "my-app",
  "version": "1.0.0",
  "dependencies": {
    "express": "^5.0.0"
  }
}`;
      const text = "The package.json configuration is actually quite important. " +
        "I think the developer should just basically use this structure:\n" +
        jsonBlock + "\n" +
        "The dependencies are very straightforward and really quite minimal. " +
        "I think the setup is basically standard. It seems the version should " +
        "be somewhat higher. The configuration is rather simple.";
      const result = cavemanCompress(text);
      expect(result).toContain(jsonBlock);
    });

    it("preserves markdown tables", () => {
      const table = "| Column A | Column B | Column C |\n" +
        "| --- | --- | --- |\n" +
        "| value1 | value2 | value3 |\n" +
        "| value4 | value5 | value6 |\n";
      const text = "Here is the data I think is actually very important:\n" +
        table +
        "The table just basically shows the values. I think it seems quite clear. " +
        "The data is really rather straightforward. The developer should just " +
        "basically look at the table above for reference. It seems the values " +
        "are somewhat expected. I think the format is very readable.";
      const result = cavemanCompress(text);
      expect(result).toContain(table);
    });
  });

  describe("size invariant", () => {
    it("returns original when compressed is >= original length", () => {
      // Text with no compressible content (all technical)
      const text = "x".repeat(600);
      expect(cavemanCompress(text)).toBe(text);
    });

    it("compressed output is always shorter than or equal to original for 500+ char text", () => {
      const text = "The developer just basically wrote a very simple function that " +
        "actually handles the requests quite efficiently. I think the implementation " +
        "is really rather straightforward. It seems the system simply processes the data " +
        "and somewhat reliably returns the results. The approach is very clean and " +
        "basically achieves the goal in order to improve the overall performance. " +
        "Due to the fact that the requirements changed, the developer had to refactor " +
        "the code as well as the tests.";
      const result = cavemanCompress(text);
      expect(result.length).toBeLessThanOrEqual(text.length);
    });
  });
});
