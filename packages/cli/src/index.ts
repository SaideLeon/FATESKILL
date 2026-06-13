#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { infoCommand } from "./commands/info.js";
import { installCommand } from "./commands/install.js";
import { listCommand } from "./commands/list.js";
import { loginCommand, logoutCommand, whoamiCommand } from "./commands/login.js";
import { publishCommand } from "./commands/publish.js";
import { searchCommand } from "./commands/search.js";

const program = new Command();

program.name("fateskill").description("CLI do FateSkill registry").version("0.1.0");
program.command("init").option("--name <name>").option("--author <author>").action(initCommand);
program.command("login").option("--token <token>").action((options: { token?: string }) => loginCommand(options.token));
program.command("logout").action(logoutCommand);
program.command("whoami").action(whoamiCommand);
program.command("publish").option("--access <visibility>").option("--dry-run").action(publishCommand);
program.command("install <spec>").action(installCommand);
program.command("search <query>").option("--tag <tag>").option("--category <category>").option("--sort <sort>", "downloads|stars|recent").action(searchCommand);
program.command("info <name>").action(infoCommand);
program.command("list").action(listCommand);
program.command("update [name]").action((name?: string) => console.log(name ? `Update planned for ${name}` : "Update all planned"));
program.command("uninstall <name>").action((name: string) => console.log(`Uninstall planned for ${name}`));
program.command("token").description("Manage API tokens").action(() => program.help());

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
