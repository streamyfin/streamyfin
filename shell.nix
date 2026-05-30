{
  system ? builtins.currentSystem,
}:

(builtins.getFlake (toString ./.)).devShells.${system}
