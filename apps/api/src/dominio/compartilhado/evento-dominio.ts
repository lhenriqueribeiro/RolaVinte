/** Fato de negócio ocorrido no passado, publicado por agregados. */
export interface EventoDominio {
  readonly nome: string;
  readonly ocorridoEm: Date;
}
