import { NextPageContext } from "next";
import NextError from "next/error";

interface Props {
  statusCode: number;
  hasGetInitialPropsRun?: boolean;
  err?: Error;
}

function CustomError({ statusCode }: Props) {
  return <NextError statusCode={statusCode} />;
}

CustomError.getInitialProps = async (ctx: NextPageContext) => {
  const errorInitialProps = await NextError.getInitialProps(ctx);
  return {
    ...errorInitialProps,
    hasGetInitialPropsRun: true,
  };
};

export default CustomError;
