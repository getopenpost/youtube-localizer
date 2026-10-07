{ pkgs, ... }: {
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    npm.enable = true;
  };
  packages = [ pkgs.git pkgs.ripgrep ];
}
